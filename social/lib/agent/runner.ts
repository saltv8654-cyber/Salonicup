import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "../supabase/server";
import { canRunAutonomously, usageBlockReason, type MemberRole, type Trigger } from "../policy";
import { loadBusinessContext, renderContext } from "./context";
import { AGENT_EFFORT, AGENT_MODEL, SPECIALIST_EFFORT, costUsd, type Effort, type Usage } from "./models";
import { ORCHESTRATOR_PROMPT, SPECIALISTS, type SpecialistId } from "./prompts";
import { executeTool, toolDefinitions, type ToolCtx } from "./tools";

type Msg = Anthropic.Beta.BetaMessageParam;

const MAX_ITERATIONS = 20;
const TIME_BUDGET_MS = 240_000; // stop cleanly before the 300 s function limit
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export interface RunOptions {
  businessId: string;
  trigger: Trigger;
  prompt: string;
  conversationId?: string | null;
  userId?: string | null;
  userRole?: MemberRole | null;
  workflow?: string | null;
}
export interface RunResult {
  runId: string | null;
  status: "succeeded" | "failed" | "stopped" | "refused" | "rejected";
  text: string;
}

class Meter {
  input = 0; output = 0; searches = 0; cost = 0;
  constructor(private db: SupabaseClient, private orgId: string, private businessId: string, private runId: string) {}
  async add(model: string, u: Usage) {
    const c = costUsd(model, u);
    this.input += u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    this.output += u.output_tokens;
    this.searches += u.server_tool_use?.web_search_requests ?? 0;
    this.cost += c;
    await this.db.from("ai_usage").insert({
      org_id: this.orgId, business_id: this.businessId, run_id: this.runId, model,
      input_tokens: u.input_tokens, output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_input_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      web_searches: u.server_tool_use?.web_search_requests ?? 0, cost_usd: c,
    });
  }
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

async function callModel(system: Anthropic.Beta.BetaTextBlockParam[], messages: Msg[], tools: Anthropic.Beta.BetaToolUnion[], effort: Effort) {
  return anthropic().beta.messages.create({
    model: AGENT_MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort },
    system,
    tools,
    messages,
  });
}

/** Runs the central agent for one business until the task is done (or a limit is hit). */
export async function runAgent(o: RunOptions): Promise<RunResult> {
  const db = serviceClient();
  const started = Date.now();

  const { data: biz } = await db.from("businesses")
    .select("id,org_id,timezone,autonomy_mode,autonomy_paused,organizations(agent_enabled,plan_id,plans(monthly_ai_budget_usd,monthly_agent_runs))")
    .eq("id", o.businessId).single();
  if (!biz) throw new Error("business not found");
  const org = biz.organizations as unknown as { agent_enabled: boolean; plans: { monthly_ai_budget_usd: number; monthly_agent_runs: number } };

  if (!org.agent_enabled) return { runId: null, status: "rejected", text: "Ο agent είναι απενεργοποιημένος για τον οργανισμό." };
  if (o.trigger !== "chat" && !canRunAutonomously({ orgEnabled: org.agent_enabled, paused: biz.autonomy_paused }))
    return { runId: null, status: "stopped", text: "Η αυτόνομη λειτουργία είναι σε παύση." };

  const { data: usage } = await db.rpc("org_month_usage", { p_org: biz.org_id }).single<{ cost_usd: number; runs: number }>();
  const blocked = usageBlockReason({
    costUsd: Number(usage?.cost_usd ?? 0), runs: Number(usage?.runs ?? 0),
    budgetUsd: Number(org.plans.monthly_ai_budget_usd), maxRuns: org.plans.monthly_agent_runs,
  });
  if (blocked) return { runId: null, status: "rejected", text: blocked };

  const { data: run, error: runErr } = await db.from("agent_runs").insert({
    business_id: o.businessId, conversation_id: o.conversationId ?? null, trigger: o.trigger, workflow: o.workflow ?? null, model: AGENT_MODEL,
  }).select("id").single();
  if (runErr || !run) throw new Error(`could not start run: ${runErr?.message}`);
  const runId: string = run.id;
  const meter = new Meter(db, biz.org_id, o.businessId, runId);

  const finish = async (status: RunResult["status"], text: string, error?: string): Promise<RunResult> => {
    await db.from("agent_runs").update({
      status: status === "rejected" ? "failed" : status, summary: text.slice(0, 4000), error: error ?? null,
      input_tokens: meter.input, output_tokens: meter.output, web_searches: meter.searches, cost_usd: meter.cost,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, status, text };
  };

  try {
    const context = renderContext(await loadBusinessContext(db, o.businessId));
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: ORCHESTRATOR_PROMPT },
      { type: "text", text: context, cache_control: { type: "ephemeral" } },
    ];
    const tools = toolDefinitions();

    // Conversation history is replayed exactly as the API returned it (append-only).
    const messages: Msg[] = [];
    if (o.conversationId) {
      const { data: history } = await db.from("conversation_messages").select("role,content")
        .eq("conversation_id", o.conversationId).eq("business_id", o.businessId).order("id");
      for (const m of history ?? []) messages.push({ role: m.role, content: m.content });
      // A run that crashed between a tool call and its result leaves a dangling tool_use; close it.
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && Array.isArray(last.content)) {
        const open = last.content.filter((b) => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlockParam[];
        if (open.length) {
          const repair: Msg = { role: "user", content: open.map((b) => ({
            type: "tool_result" as const, tool_use_id: b.id, is_error: true, content: "Interrupted: the previous run stopped before this tool finished.",
          })) };
          messages.push(repair);
          await db.from("conversation_messages").insert({ conversation_id: o.conversationId, business_id: o.businessId, role: "user", content: repair.content, run_id: runId });
        }
      }
    }
    const persist = async (m: Msg) => {
      messages.push(m);
      if (o.conversationId)
        await db.from("conversation_messages").insert({
          conversation_id: o.conversationId, business_id: o.businessId, role: m.role, content: m.content, run_id: runId,
        });
    };

    const now = new Intl.DateTimeFormat("el-GR", { dateStyle: "full", timeStyle: "short", timeZone: biz.timezone }).format(new Date());
    await persist({ role: "user", content: [{ type: "text", text: `[${now}, ${biz.timezone}]\n\n${o.prompt}` }] });

    const ctx: ToolCtx = {
      db, businessId: o.businessId, orgId: biz.org_id, runId, trigger: o.trigger,
      userId: o.userId ?? null, userRole: o.userRole ?? null,
      mode: biz.autonomy_mode, paused: biz.autonomy_paused, orgEnabled: org.agent_enabled, timezone: biz.timezone,
      callSpecialist: (agent, task) => runSpecialist(agent, task, context, meter, runId, o.businessId),
    };

    const replies: string[] = [];
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (Date.now() - started > TIME_BUDGET_MS)
        return finish("stopped", [...replies, "⏱️ Σταμάτησα λόγω χρονικού ορίου. Γράψε «συνέχισε» για να ολοκληρώσω."].join("\n\n"));

      // Emergency stop is honoured between steps for autonomous runs.
      if (o.trigger !== "chat" && i > 0) {
        const { data: now2 } = await db.from("businesses").select("autonomy_paused").eq("id", o.businessId).single();
        if (now2?.autonomy_paused) return finish("stopped", [...replies, "⏹️ Διακόπηκε από emergency stop."].join("\n\n"));
      }

      const res = await callModel(system, messages, tools, AGENT_EFFORT);
      await meter.add(res.model, res.usage as Usage);
      await persist({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
      const text = textOf(res.content);
      if (text) replies.push(text);

      if (res.stop_reason === "refusal") return finish("refused", [...replies, "Το αίτημα απορρίφθηκε από τα φίλτρα ασφαλείας του μοντέλου."].join("\n\n"));
      if (res.stop_reason === "pause_turn") continue;
      if (res.stop_reason === "max_tokens") return finish("stopped", [...replies, "Η απάντηση έφτασε το όριο μήκους. Γράψε «συνέχισε»."].join("\n\n"));
      if (res.stop_reason !== "tool_use") return finish("succeeded", replies.join("\n\n") || "(χωρίς κείμενο)");

      const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(calls.map(async (call) => {
        const t0 = Date.now();
        const { ok, output } = await executeTool(ctx, call.name, call.input);
        await db.from("agent_steps").insert({
          run_id: runId, business_id: o.businessId, agent: "orchestrator", tool: call.name,
          input: call.input, output, is_error: !ok, duration_ms: Date.now() - t0,
        });
        return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(output), is_error: !ok };
      }));
      await persist({ role: "user", content: results });
    }
    return finish("stopped", [...replies, "Έφτασα το μέγιστο αριθμό βημάτων για αυτή την εντολή. Γράψε «συνέχισε»."].join("\n\n"));
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Claude API ${e.status}: ${e.message}` : (e as Error).message;
    await finish("failed", "Η εκτέλεση απέτυχε.", msg);
    throw e;
  }
}

/** A specialist sub-agent: own role prompt, same business context, optional web search, no write tools. */
async function runSpecialist(agent: SpecialistId, task: string, context: string, meter: Meter, runId: string, businessId: string) {
  const spec = SPECIALISTS[agent];
  const db = serviceClient();
  const t0 = Date.now();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: `${spec.prompt}\n\nReply in Greek unless the task says otherwise. Be concrete and complete; your output goes to the lead agent, not to the end user. Never invent data.` },
    { type: "text", text: context, cache_control: { type: "ephemeral" } },
  ];
  const tools: Anthropic.Beta.BetaToolUnion[] = spec.webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] : [];
  const messages: Msg[] = [{ role: "user", content: task }];
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const res = await callModel(system, messages, tools, SPECIALIST_EFFORT);
    await meter.add(res.model, res.usage as Usage);
    const text = textOf(res.content);
    if (text) out.push(text);
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  const output = out.join("\n\n") || "(ο specialist δεν επέστρεψε κείμενο)";
  await db.from("agent_steps").insert({
    run_id: runId, business_id: businessId, agent, tool: "specialist", input: { task }, output: { text: output.slice(0, 20000) },
    duration_ms: Date.now() - t0,
  });
  return output;
}

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decide, type ActionKind, type AutonomyMode, type Trigger } from "../policy";
import * as league from "../salonicup";
import { SPECIALISTS, type SpecialistId } from "./prompts";

export interface ToolCtx {
  db: SupabaseClient; // service role (server only)
  runId: string;
  trigger: Trigger;
  userId: string | null;
  mode: AutonomyMode;
  paused: boolean;
  timezone: string;
  callSpecialist: (agent: SpecialistId, task: string) => Promise<string>;
}

type Result = Record<string, unknown>;
interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  run: (ctx: ToolCtx, input: z.infer<S>) => Promise<Result>;
}
const tool = <S extends z.ZodTypeAny>(d: ToolDef<S>) => d;

const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "linkedin"] as const;
const KINDS = ["post", "story", "carousel", "reel", "short", "video", "article", "thumbnail", "ad"] as const;
const STATUSES = ["idea", "draft", "pending_approval", "approved", "scheduled", "publishing", "published", "failed", "rejected", "archived"] as const;
const isoDate = z.string().describe("ISO 8601 date-time with offset, e.g. 2026-11-20T18:30:00+02:00");

// The database is untyped here; rows are constrained by the schema, not by TS generics.
type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any
function check(r: { data: unknown; error: { message: string } | null }): Row {
  if (r.error) throw new Error(r.error.message);
  if (r.data == null) throw new Error("not found");
  return r.data;
}

async function audit(ctx: ToolCtx, action: string, targetType: string, targetId: string, details: Result = {}) {
  await ctx.db.from("social_activity").insert({ actor_type: "agent", actor_id: ctx.runId, action, target_type: targetType, target_id: targetId, details });
}

const gate = (ctx: ToolCtx, action: ActionKind) => decide({ action, mode: ctx.mode, paused: ctx.paused, trigger: ctx.trigger });

async function requestApproval(ctx: ToolCtx, action: string, targetType: string, targetId: string | null, summary: string, payload: Result) {
  const row = check(await ctx.db.from("social_approvals").insert({
    action, target_type: targetType, target_id: targetId, summary, payload, requested_by: "agent", run_id: ctx.runId,
  }).select("id").single());
  await audit(ctx, "approval.requested", "approval", row.id, { action, summary });
  return { status: "needs_approval", approval_id: row.id, message: "Waiting for an admin in Approvals." };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const getLeagueData = tool({
  name: "get_league_data",
  description: "Real Salonicup data from the league database: upcoming fixtures, recent results (scorers, MVP, red cards, excerpt of the match report, stream link), standings per league, top scorers, active leagues. Use it for every matchday, result, standings or player post — never invent football facts.",
  schema: z.object({
    kind: z.enum(["upcoming_matches", "recent_results", "standings", "top_scorers", "leagues"]),
    days: z.number().int().min(1).max(60).optional().describe("look-ahead / look-back window for matches (default 7)"),
  }),
  async run(ctx, i) {
    switch (i.kind) {
      case "upcoming_matches": return { matches: await league.upcomingMatches(ctx.db, i.days ?? 7) };
      case "recent_results": return { results: await league.recentResults(ctx.db, i.days ?? 7) };
      case "standings": return { standings: await league.standings(ctx.db) };
      case "top_scorers": return { top_scorers: await league.topScorers(ctx.db) };
      case "leagues": return { leagues: await league.leagues(ctx.db) };
    }
  },
});

const saveMemory = tool({
  name: "save_memory",
  description: "Store a durable fact in long-term memory (preferences, learnings, decisions, audience insights, strategy). Not for trivia, duplicates or league data that is already in the database.",
  schema: z.object({
    kind: z.enum(["fact", "preference", "learning", "strategy", "campaign", "audience", "performance"]),
    content: z.string().min(3).max(2000),
    importance: z.number().int().min(1).max(5).describe("5 = must always be considered"),
  }),
  async run(ctx, i) {
    if (gate(ctx, "save_memory") === "blocked") return { status: "blocked" };
    const row = check(await ctx.db.from("social_memories").insert({ ...i, source: "agent" }).select("id").single());
    return { status: "saved", id: row.id };
  },
});

const searchMemory = tool({
  name: "search_memory",
  description: "Search long-term memory, including items not shown in the context.",
  schema: z.object({ query: z.string().min(2).max(200), limit: z.number().int().min(1).max(50).optional() }),
  async run(ctx, i) {
    const words = i.query.split(/\s+/).filter((w) => w.length > 2).slice(0, 5).map((w) => w.replace(/[%,()*]/g, ""));
    let q = ctx.db.from("social_memories").select("id,kind,content,importance,created_at").eq("archived", false);
    if (words.length) q = q.or(words.map((w) => `content.ilike.%${w}%`).join(","));
    return { results: check(await q.order("importance", { ascending: false }).limit(i.limit ?? 20)) };
  },
});

const BRAND_FIELDS = {
  description: z.string().max(2000).optional(),
  website: z.string().max(300).optional(),
  voice: z.string().max(1000).optional(),
  tone: z.string().max(1000).optional(),
  target_audience: z.string().max(2000).optional(),
  objectives: z.string().max(2000).optional(),
  colors: z.array(z.object({ name: z.string(), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(12).optional(),
  fonts: z.array(z.object({ role: z.string(), family: z.string() })).max(6).optional(),
  do_list: z.array(z.string().max(300)).max(30).optional(),
  dont_list: z.array(z.string().max(300)).max(30).optional(),
  hashtags: z.array(z.string().max(60)).max(30).optional(),
  guidelines: z.string().max(5000).optional(),
};
export const BrandPatch = z.object(BRAND_FIELDS);

const updateBrand = tool({
  name: "update_brand_profile",
  description: "Update the Salonicup brand identity (description, voice, tone, audience, objectives, colors, fonts, do/don't rules, hashtags, guidelines). Only include fields that change.",
  schema: BrandPatch,
  async run(ctx, i) {
    const d = gate(ctx, "update_brand");
    if (d === "blocked") return { status: "blocked" };
    if (d === "needs_approval") return requestApproval(ctx, "update_brand", "settings", null, "Αλλαγή brand profile", i);
    check(await ctx.db.from("social_settings").update({ ...i, updated_at: new Date().toISOString() }).eq("id", true).select("id").single());
    await audit(ctx, "brand.updated", "settings", "brand", { fields: Object.keys(i) });
    return { status: "updated", fields: Object.keys(i) };
  },
});

const createCampaign = tool({
  name: "create_campaign",
  description: "Create a campaign (e.g. a season phase, playoffs, a sponsor promotion) with objective, dates and strategy. Returns campaign_id for linking drafts.",
  schema: z.object({
    name: z.string().min(2).max(160),
    objective: z.string().max(1000),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    strategy: z.string().max(8000).describe("pillars, formats, frequency, KPIs, experiments"),
  }),
  async run(ctx, i) {
    if (gate(ctx, "plan_campaign") === "blocked") return { status: "blocked" };
    const row = check(await ctx.db.from("social_campaigns").insert({ ...i, created_by: "agent" }).select("id").single());
    await audit(ctx, "campaign.created", "campaign", row.id, { name: i.name });
    return { status: "created", campaign_id: row.id };
  },
});

const variant = z.object({
  caption: z.string().max(5000),
  hashtags: z.array(z.string().max(80)).max(30).optional(),
  format: z.string().max(200).optional().describe("e.g. 'reel 9:16, 20s' or 'carousel 5 slides 4:5'"),
  notes: z.string().max(1000).optional(),
});

const createDrafts = tool({
  name: "create_content_drafts",
  description: "Create content items (drafts) in the content calendar, each with a master caption and per-platform variants. Link match_id when the post is about a specific match. Use planned_for to place it in the calendar. This does NOT publish or schedule anything.",
  schema: z.object({
    campaign_id: z.string().uuid().optional(),
    items: z.array(z.object({
      kind: z.enum(KINDS),
      title: z.string().min(2).max(200),
      brief: z.string().max(4000).describe("creative brief: visual idea, on-image text, video script/shots"),
      caption: z.string().max(5000),
      hashtags: z.array(z.string().max(80)).max(30),
      cta: z.string().max(300).optional(),
      platforms: z.array(z.enum(PLATFORMS)).min(1),
      variants: z.record(z.enum(PLATFORMS), variant).optional(),
      planned_for: isoDate.optional(),
      match_id: z.string().uuid().optional(),
    })).min(1).max(30),
  }),
  async run(ctx, i) {
    if (gate(ctx, "create_draft") === "blocked") return { status: "blocked" };
    const rows = check(await ctx.db.from("social_content").insert(i.items.map((it) => ({
      campaign_id: i.campaign_id ?? null, match_id: it.match_id ?? null, kind: it.kind, title: it.title, brief: it.brief,
      caption: it.caption, hashtags: it.hashtags, cta: it.cta ?? null, platforms: it.platforms, variants: it.variants ?? {},
      planned_for: it.planned_for ?? null, status: "draft", created_by: "agent", run_id: ctx.runId,
    }))).select("id,title,planned_for"));
    await audit(ctx, "content.drafts_created", "content", rows.map((r: Row) => r.id).join(","), { count: rows.length });
    return { status: "created", items: rows };
  },
});

const listContent = tool({
  name: "list_content",
  description: "List content items, optionally by date range (planned_for) and status.",
  schema: z.object({
    from: isoDate.optional(), to: isoDate.optional(),
    status: z.array(z.enum(STATUSES)).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  async run(ctx, i) {
    let q = ctx.db.from("social_content").select("id,kind,title,caption,platforms,status,planned_for,scheduled_for,campaign_id,match_id,last_error");
    if (i.from) q = q.gte("planned_for", i.from);
    if (i.to) q = q.lte("planned_for", i.to);
    if (i.status?.length) q = q.in("status", i.status);
    return { items: check(await q.order("planned_for", { ascending: true, nullsFirst: false }).limit(i.limit ?? 50)) };
  },
});

const updateContent = tool({
  name: "update_content",
  description: "Edit a content item. Editing an approved or scheduled item sends it back to draft.",
  schema: z.object({
    id: z.string().uuid(),
    title: z.string().max(200).optional(),
    brief: z.string().max(4000).optional(),
    caption: z.string().max(5000).optional(),
    hashtags: z.array(z.string().max(80)).max(30).optional(),
    cta: z.string().max(300).optional(),
    platforms: z.array(z.enum(PLATFORMS)).min(1).optional(),
    variants: z.record(z.enum(PLATFORMS), variant).optional(),
    planned_for: isoDate.optional(),
  }),
  async run(ctx, { id, ...fields }) {
    if (gate(ctx, "create_draft") === "blocked") return { status: "blocked" };
    const cur = check(await ctx.db.from("social_content").select("status").eq("id", id).single());
    if (["publishing", "published"].includes(cur.status)) return { status: "not_editable", reason: `status is ${cur.status}` };
    const patch: Result = { ...fields };
    if (["approved", "scheduled", "pending_approval"].includes(cur.status)) { patch.status = "draft"; patch.scheduled_for = null; }
    check(await ctx.db.from("social_content").update(patch).eq("id", id).select("id").single());
    return { status: "updated", reset_to_draft: patch.status === "draft" };
  },
});

const scheduleContent = tool({
  name: "schedule_content",
  description: "Commit a content item to be published at a time. Depending on the autonomy mode this schedules it or creates an approval request.",
  schema: z.object({ id: z.string().uuid(), scheduled_for: isoDate }),
  async run(ctx, i) {
    const item = check(await ctx.db.from("social_content").select("id,title,platforms,status").eq("id", i.id).single());
    if (!(new Date(i.scheduled_for).getTime() > Date.now() + 60_000)) return { status: "invalid", reason: "scheduled_for must be in the future" };
    const accounts = check(await ctx.db.from("social_accounts").select("platform").eq("status", "connected")) as { platform: string }[];
    const missing = (item.platforms as string[]).filter((p) => !accounts.some((a) => a.platform === p));
    const warning = missing.length
      ? `No connected account for: ${missing.join(", ")}. It can be scheduled but cannot be published there until an account is connected (Phase 3).`
      : undefined;

    const d = gate(ctx, "schedule_post");
    if (d === "blocked") return { status: "blocked" };
    if (d === "needs_approval") {
      await ctx.db.from("social_content").update({ status: "pending_approval" }).eq("id", item.id);
      return { ...(await requestApproval(ctx, "schedule_post", "content", item.id,
        `Προγραμματισμός: «${item.title}» για ${i.scheduled_for}`, { scheduled_for: i.scheduled_for })), warning };
    }
    check(await ctx.db.from("social_content").update({ status: "scheduled", scheduled_for: i.scheduled_for }).eq("id", item.id).select("id").single());
    await audit(ctx, "content.scheduled", "content", item.id, { scheduled_for: i.scheduled_for });
    return { status: "scheduled", warning };
  },
});

const recentActivity = tool({
  name: "get_recent_activity",
  description: "Recent history: approval decisions (with the admins' notes), agent runs and audit events. Use it to learn preferences.",
  schema: z.object({ days: z.number().int().min(1).max(90).optional() }),
  async run(ctx, i) {
    const since = new Date(Date.now() - (i.days ?? 7) * 86_400_000).toISOString();
    const [approvals, runs, events] = await Promise.all([
      ctx.db.from("social_approvals").select("action,summary,status,note,decided_at").gte("created_at", since).order("created_at", { ascending: false }).limit(30),
      ctx.db.from("social_runs").select("trigger,workflow,status,summary,started_at").gte("started_at", since).order("started_at", { ascending: false }).limit(15),
      ctx.db.from("social_activity").select("actor_type,action,target_type,details,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    ]);
    return {
      approvals: approvals.data ?? [],
      runs: (runs.data ?? []).map((r) => ({ ...r, summary: r.summary?.slice(0, 300) })),
      events: events.data ?? [],
    };
  },
});

const delegate = tool({
  name: "delegate_to_specialist",
  description: `Assign a focused task to a specialist sub-agent and get its output back for review. Specialists: ${Object.entries(SPECIALISTS).map(([k, v]) => `${k} (${v.label})`).join(", ")}. Give complete instructions and include any league data it needs; the specialist sees the brand context but not this conversation and has no database tools.`,
  schema: z.object({
    agent: z.enum(Object.keys(SPECIALISTS) as [SpecialistId, ...SpecialistId[]]),
    task: z.string().min(10).max(12000),
  }),
  async run(ctx, i) {
    return { agent: i.agent, output: await ctx.callSpecialist(i.agent, i.task) };
  },
});

// ---------------------------------------------------------------------------
export const TOOLS = [getLeagueData, saveMemory, searchMemory, updateBrand, createCampaign, createDrafts, listContent,
  updateContent, scheduleContent, recentActivity, delegate] as ToolDef<z.ZodTypeAny>[];

export function toolDefinitions(): Anthropic.Beta.BetaToolUnion[] {
  const custom = TOOLS.map((t) => {
    const { $schema, ...schema } = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, input_schema: schema as Anthropic.Beta.BetaTool.InputSchema };
  });
  return [...custom, { type: "web_search_20260209", name: "web_search", max_uses: 5 }];
}

export async function executeTool(ctx: ToolCtx, name: string, rawInput: unknown): Promise<{ ok: boolean; output: Result }> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { ok: false, output: { error: `unknown tool ${name}` } };
  const parsed = t.schema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, output: { error: "invalid input", issues: parsed.error.issues.slice(0, 10) } };
  try {
    return { ok: true, output: await t.run(ctx, parsed.data) };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message } };
  }
}

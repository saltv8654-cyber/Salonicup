import { serviceClient } from "../supabase/server";
import { retryDelayMs, isRetryable } from "../backoff";
import { nextRun, type ScheduleSpec } from "../schedule";
import { runAgent } from "../agent/runner";
import { WORKFLOW_PROMPTS } from "../agent/prompts";

type Job = { id: string; business_id: string | null; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };

/** Job handlers. Every handler must be safe to run twice (retries, lock timeouts). */
const HANDLERS: Record<string, (job: Job) => Promise<Record<string, unknown>>> = {
  async agent_workflow(job) {
    const workflow = String(job.payload.workflow);
    const prompt = WORKFLOW_PROMPTS[workflow];
    if (!prompt || !job.business_id) throw Object.assign(new Error(`unknown workflow ${workflow}`), { status: 400 });
    const r = await runAgent({ businessId: job.business_id, trigger: "schedule", workflow, prompt });
    return { run_id: r.runId, status: r.status, summary: r.text.slice(0, 1000) };
  },
  async agent_task(job) {
    if (!job.business_id) throw Object.assign(new Error("business_id required"), { status: 400 });
    const r = await runAgent({ businessId: job.business_id, trigger: "job", prompt: String(job.payload.prompt) });
    return { run_id: r.runId, status: r.status, summary: r.text.slice(0, 1000) };
  },
};

/** Turns due workflow schedules into jobs. The idempotency key makes a double tick harmless. */
export async function enqueueDueSchedules(now = new Date()) {
  const db = serviceClient();
  const { data: due } = await db.from("workflow_schedules")
    .select("id,business_id,workflow,hour_local,weekday,monthday,next_run_at,businesses(timezone,autonomy_paused)")
    .eq("enabled", true).lte("next_run_at", now.toISOString()).limit(100);
  let enqueued = 0;
  for (const s of due ?? []) {
    const biz = s.businesses as unknown as { timezone: string; autonomy_paused: boolean };
    const next = nextRun(s as ScheduleSpec, biz.timezone, now);
    // Advance first (compare-and-set on next_run_at) so two concurrent ticks cannot both enqueue.
    const { data: moved } = await db.from("workflow_schedules")
      .update({ next_run_at: next.toISOString(), last_run_at: now.toISOString() })
      .eq("id", s.id).eq("next_run_at", s.next_run_at).select("id");
    if (!moved?.length || biz.autonomy_paused) continue;
    const { error } = await db.from("jobs").insert({
      business_id: s.business_id, type: "agent_workflow", payload: { workflow: s.workflow }, max_attempts: 3,
      idempotency_key: `wf:${s.id}:${s.next_run_at}`,
    });
    if (!error) enqueued++;
  }
  return enqueued;
}

export async function processJobs(workerId: string, budgetMs: number) {
  const db = serviceClient();
  const started = Date.now();
  const done: { id: string; type: string; status: string; error?: string }[] = [];
  while (Date.now() - started < budgetMs) {
    const { data: jobs, error } = await db.rpc("claim_jobs", { p_worker: workerId, p_limit: 1 });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    const job = (jobs as Job[] | null)?.[0];
    if (!job) break;

    const handler = HANDLERS[job.type];
    try {
      if (!handler) throw Object.assign(new Error(`no handler for ${job.type}`), { status: 400 });
      const result = await handler(job);
      await db.from("jobs").update({ status: "succeeded", result, locked_at: null, last_error: null }).eq("id", job.id);
      done.push({ id: job.id, type: job.type, status: "succeeded" });
    } catch (e) {
      const message = (e as Error).message?.slice(0, 2000) ?? String(e);
      const retry = isRetryable(e) && job.attempts < job.max_attempts;
      await db.from("jobs").update({
        status: retry ? "queued" : job.attempts >= job.max_attempts ? "dead" : "failed",
        run_at: retry ? new Date(Date.now() + retryDelayMs(job.attempts)).toISOString() : undefined,
        last_error: message, locked_at: null, locked_by: null,
      }).eq("id", job.id);
      done.push({ id: job.id, type: job.type, status: retry ? "retry" : "failed", error: message });
      console.error(`job ${job.id} (${job.type}) failed`, message);
    }
  }
  return done;
}

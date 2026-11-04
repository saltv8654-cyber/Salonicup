import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";
import type { QueueItem, RunLog, Source } from "@/lib/energy/model";
import { today } from "@/lib/energy/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_DAYS = 45;

export const GET = adminRoute(async () => {
  const [providers, sources, pending, tariffs, logs] = await Promise.all([
    db().from("energy_providers").select("id, active"),
    db().from("tariff_data_sources").select("*"),
    db().from("tariff_update_queue").select("id, change_type, flags").eq("status", "pending").limit(5000),
    db().from("tariffs").select("id, category, active, segment, last_verified_at, valid_until, data_status").limit(5000),
    db().from("tariff_update_logs").select("*").order("started_at", { ascending: false }).limit(200),
  ]);
  const p = must(providers) as { active: boolean }[];
  const s = must(sources) as Source[];
  const q = must(pending) as Pick<QueueItem, "change_type" | "flags">[];
  const t = (must(tariffs) as Record<string, unknown>[]).filter((r) => (r.category ?? "electricity") === "electricity" && r.active);
  const l = must(logs) as RunLog[];

  const staleBefore = Date.now() - STALE_DAYS * 86_400_000;
  const lastOk = l.find((r) => r.status === "ok" || r.status === "unchanged");
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  return json({
    kpis: {
      providers: p.filter((x) => x.active).length,
      active_programs: t.length,
      new_programs: q.filter((x) => x.change_type === "new").length,
      price_changes: q.filter((x) => x.change_type === "price_change" || x.change_type === "details_change").length,
      discontinued: q.filter((x) => x.change_type === "discontinued").length,
      pending: q.length,
      flagged: q.filter((x) => (x.flags ?? []).length > 0).length,
      failed_sources: s.filter((x) => x.enabled && x.last_status === "failed").length,
      failed_runs_7d: l.filter((r) => r.status === "failed" && r.started_at >= weekAgo).length,
      last_success_at: lastOk?.finished_at ?? lastOk?.started_at ?? null,
      sources: s.filter((x) => x.enabled).length,
      unverified_programs: t.filter((r) => r.data_status !== "verified" || !r.last_verified_at || Date.parse(String(r.last_verified_at)) < staleBefore).length,
      expired_programs: t.filter((r) => r.valid_until && String(r.valid_until) < today()).length,
    },
    setup: {
      cron_secret: !!process.env.CRON_SECRET,
      anthropic_key: !!process.env.ANTHROPIC_API_KEY,
      telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    },
    stale_days: STALE_DAYS,
  });
});

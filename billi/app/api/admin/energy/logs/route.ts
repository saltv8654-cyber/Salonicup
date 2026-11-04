import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?kind=runs (collection runs) | activity (audit log) */
export const GET = adminRoute(async (req) => {
  const kind = req.nextUrl.searchParams.get("kind") ?? "runs";
  if (kind === "activity") {
    return json({ activity: must(await db().from("admin_activity_logs").select("*").order("created_at", { ascending: false }).limit(300)) });
  }
  const failedOnly = req.nextUrl.searchParams.get("failed") === "1";
  let q = db().from("tariff_update_logs").select("*").order("started_at", { ascending: false }).limit(300);
  if (failedOnly) q = q.eq("status", "failed");
  return json({ runs: must(await q) });
});

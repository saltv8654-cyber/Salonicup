import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Review table. ?status=pending (default) | approved | rejected | superseded | all */
export const GET = adminRoute(async (req) => {
  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  let q = db().from("tariff_update_queue").select("*").order("created_at", { ascending: false }).limit(500);
  if (status !== "all") q = q.eq("status", status);
  return json({ items: must(await q) });
});

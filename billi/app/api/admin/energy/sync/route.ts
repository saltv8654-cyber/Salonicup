import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";
import type { Source } from "@/lib/energy/model";
import { runSource } from "@/lib/energy/run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Manual check of one source ({ source_id }); the dashboard calls it once per source to stay within time limits. */
export const POST = adminRoute(async (req, admin) => {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "Λείπει το ANTHROPIC_API_KEY στο Vercel" }, 500);
  const body = await req.json().catch(() => ({}));
  if (typeof body.source_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.source_id)) return json({ error: "Διάλεξε πηγή" }, 400);
  const source = must(await db().from("tariff_data_sources").select("*").eq("id", body.source_id).maybeSingle()) as Source | null;
  if (!source) return json({ error: "Η πηγή δεν βρέθηκε" }, 404);
  // "Force" re-reads the source even if its content looks unchanged.
  const result = await runSource(body.force ? { ...source, last_hash: null } : source, "manual", admin);
  return json({ result });
});

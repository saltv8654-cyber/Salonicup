import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";
import type { QueueItem } from "@/lib/energy/model";
import { approve } from "@/lib/energy/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Approve every pending new / changed programme with no flags at all. Removals are always reviewed one by one. */
export const POST = adminRoute(async (req, admin) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] | null = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : null;
  const items = must(await db().from("tariff_update_queue").select("*").eq("status", "pending").limit(500)) as QueueItem[];
  const clean = items.filter((i) => (i.flags ?? []).length === 0 && i.change_type !== "discontinued" && (!ids || ids.includes(i.id)));
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const i of clean) {
    try {
      await approve(i.id, admin, { notes: "Μαζική έγκριση (χωρίς επισημάνσεις)" });
      done.push(i.id);
    } catch (e) {
      failed.push({ id: i.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ approved: done.length, failed });
});

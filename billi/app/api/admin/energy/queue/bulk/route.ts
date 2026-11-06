import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";
import type { QueueItem } from "@/lib/energy/model";
import { approve, reject } from "@/lib/energy/publish";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Bulk review: { action: "approve" | "reject", ids: [...] } for the changes the administrator ticked.
 * Without ids, "approve" takes every pending new / changed programme that has no flags at all.
 * Warnings don't block an approval the administrator chose; errors (e.g. a missing price) still do.
 */
export const POST = adminRoute(async (req, admin) => {
  const body = await req.json().catch(() => ({}));
  const action = body.action === "reject" ? "reject" : "approve";
  const ids: string[] | null = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 500) : null;
  const items = must(await db().from("tariff_update_queue").select("*").eq("status", "pending").limit(1000)) as QueueItem[];
  const chosen = ids
    ? items.filter((i) => ids.includes(i.id))
    : items.filter((i) => action === "approve" && (i.flags ?? []).length === 0 && i.change_type !== "discontinued");
  const note = ids ? `Μαζική ${action === "approve" ? "έγκριση" : "απόρριψη"} επιλεγμένων` : "Μαζική έγκριση (χωρίς επισημάνσεις)";

  const done: string[] = [];
  const failed: { id: string; program: string; error: string }[] = [];
  for (const i of chosen) {
    try {
      if (action === "approve") await approve(i.id, admin, { notes: i.notes ?? note });
      else await reject(i.id, admin, i.notes ?? note);
      done.push(i.id);
    } catch (e) {
      failed.push({ id: i.id, program: `${i.provider} ${i.program}`, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ done: done.length, approved: action === "approve" ? done.length : 0, rejected: action === "reject" ? done.length : 0, failed });
});

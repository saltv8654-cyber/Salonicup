import { db } from "./db";

export interface Activity {
  admin: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  before?: unknown;
  after?: unknown;
  source_url?: string | null;
  source_document?: string | null;
  note?: string | null;
}

/** Appends to admin_activity_logs. Never throws: a missing table (migration not run yet) must not block the edit itself. */
export async function logActivity(a: Activity) {
  try {
    const { error } = await db().from("admin_activity_logs").insert({
      admin: a.admin, action: a.action, entity: a.entity, entity_id: a.entity_id ?? null,
      before: a.before ?? null, after: a.after ?? null, source_url: a.source_url ?? null,
      source_document: a.source_document ?? null, note: a.note ?? null,
    });
    if (error && !/does not exist|Could not find the table/i.test(error.message)) console.error("logActivity:", error.message);
  } catch (e) {
    console.error("logActivity:", e);
  }
}

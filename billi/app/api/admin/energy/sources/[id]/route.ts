import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminRoute, isSiteMigrationMissing, json, must } from "@/lib/energy/http";
import { SourceInput } from "@/lib/energy/inputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = adminRoute(async (req, admin, { params }) => {
  const parsed = SourceInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, 400);
  const before = must(await db().from("tariff_data_sources").select("*").eq("id", params.id).maybeSingle());
  if (!before) return json({ error: "Η πηγή δεν βρέθηκε" }, 404);
  // A new link must be read from scratch.
  const reset = (before as { url: string }).url !== parsed.data.url ? { last_hash: null } : {};
  const { data, error } = await db()
    .from("tariff_data_sources")
    .update({ ...parsed.data, ...reset, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error && isSiteMigrationMissing(error.message)) return json({ error: "missing_site_migration" }, 409);
  if (error) return json({ error: error.message }, 400);
  await logActivity({ admin, action: "source_update", entity: "tariff_data_sources", entity_id: params.id, before, after: data, source_url: parsed.data.url });
  return json({ source: data });
});

export const DELETE = adminRoute(async (_req, admin, { params }) => {
  const before = must(await db().from("tariff_data_sources").select("*").eq("id", params.id).maybeSingle());
  must(await db().from("tariff_data_sources").delete().eq("id", params.id));
  await logActivity({ admin, action: "source_delete", entity: "tariff_data_sources", entity_id: params.id, before });
  return json({ ok: true });
});

import { db } from "@/lib/db";
import { documentUrl } from "@/lib/energy/fetch-source";
import { adminRoute, json, must } from "@/lib/energy/http";
import { TariffValuesSchema, approve, editPending, reject } from "@/lib/energy/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = TariffValuesSchema.nullable().optional();

export const GET = adminRoute(async (_req, _admin, { params }) => {
  const item = must(await db().from("tariff_update_queue").select("*").eq("id", params.id).maybeSingle()) as Record<string, unknown> | null;
  if (!item) return json({ error: "Η αλλαγή δεν βρέθηκε" }, 404);
  const history = item.tariff_id
    ? must(await db().from("tariff_price_history").select("*").eq("tariff_id", item.tariff_id as string).order("changed_at", { ascending: false }).limit(100))
    : [];
  return json({ item, history });
});

/** Save edits and/or an internal note on a pending change. */
export const PUT = adminRoute(async (req, admin, { params }) => {
  const body = await req.json().catch(() => ({}));
  const values = Body.safeParse(body.values);
  if (!values.success) return json({ error: values.error.issues[0]?.message ?? "Μη έγκυρες τιμές" }, 400);
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : undefined;
  return json({ item: await editPending(params.id, admin, values.data ?? null, notes) });
});

/** { action: "approve" | "reject", values?, notes? } */
export const POST = adminRoute(async (req, admin, { params }) => {
  const body = await req.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : undefined;
  if (body.action === "reject") {
    await reject(params.id, admin, notes);
    return json({ ok: true });
  }
  if (body.action === "approve") {
    const values = Body.safeParse(body.values);
    if (!values.success) return json({ error: values.error.issues[0]?.message ?? "Μη έγκυρες τιμές" }, 400);
    return json(await approve(params.id, admin, { values: values.data ?? undefined, notes }));
  }
  if (body.action === "document") {
    const item = must(await db().from("tariff_update_queue").select("source_document").eq("id", params.id).maybeSingle()) as { source_document: string | null } | null;
    if (!item?.source_document) return json({ error: "Δεν κρατήθηκε αντίγραφο της πηγής" }, 404);
    return json({ url: await documentUrl(item.source_document) });
  }
  return json({ error: "Άγνωστη ενέργεια" }, 400);
});

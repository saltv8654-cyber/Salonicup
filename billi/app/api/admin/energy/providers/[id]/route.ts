import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";
import { ProviderInput } from "@/lib/energy/inputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = adminRoute(async (req, admin, { params }) => {
  const parsed = ProviderInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, 400);
  const p = parsed.data;
  const before = must(await db().from("energy_providers").select("*").eq("id", params.id).maybeSingle());
  if (!before) return json({ error: "Ο πάροχος δεν βρέθηκε" }, 404);
  const { data, error } = await db()
    .from("energy_providers")
    .update({ ...p, website: p.website || null, aliases: [...new Set([p.name, ...p.aliases])], updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return json({ error: error.message }, 400);
  await logActivity({ admin, action: "provider_update", entity: "energy_providers", entity_id: params.id, before, after: data });
  return json({ provider: data });
});

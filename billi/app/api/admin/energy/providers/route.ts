import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminRoute, json } from "@/lib/energy/http";
import { ProviderInput } from "@/lib/energy/inputs";
import { slug } from "@/lib/tariff-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = adminRoute(async (req, admin) => {
  const parsed = ProviderInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, 400);
  const p = parsed.data;
  const row = { ...p, slug: slug(p.name), website: p.website || null, aliases: [...new Set([p.name, ...p.aliases])] };
  const { data, error } = await db().from("energy_providers").insert(row).select().single();
  if (error) return json({ error: /duplicate|unique/i.test(error.message) ? "Ο πάροχος υπάρχει ήδη" : error.message }, 400);
  await logActivity({ admin, action: "provider_create", entity: "energy_providers", entity_id: (data as { id: string }).id, after: data });
  return json({ provider: data }, 201);
});

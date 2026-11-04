import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminRoute, isSiteMigrationMissing, json, must } from "@/lib/energy/http";
import { SourceInput } from "@/lib/energy/inputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async () => {
  const [sources, providers] = await Promise.all([
    db().from("tariff_data_sources").select("*").order("label"),
    db().from("energy_providers").select("*").order("name"),
  ]);
  return json({ sources: must(sources), providers: must(providers) });
});

export const POST = adminRoute(async (req, admin) => {
  const parsed = SourceInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, 400);
  const { data, error } = await db().from("tariff_data_sources").insert(parsed.data).select().single();
  if (error && isSiteMigrationMissing(error.message)) return json({ error: "missing_site_migration" }, 409);
  if (error) return json({ error: /duplicate|unique/i.test(error.message) ? "Αυτό το link υπάρχει ήδη" : error.message }, 400);
  await logActivity({ admin, action: "source_create", entity: "tariff_data_sources", entity_id: (data as { id: string }).id, after: data, source_url: parsed.data.url });
  return json({ source: data }, 201);
});

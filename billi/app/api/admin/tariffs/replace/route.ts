import raaey from "@/data/raaey-2026-11.json";
import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";
import { normKey, type Provider } from "@/lib/energy/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replace every household electricity programme with the ΡΑΑΕΥ list (data/raaey-2026-11.json).
 * The administrator triggers it, so this is their approval. Old rows are deleted; the database trigger
 * keeps each of them in the price history and the audit log records the swap.
 */
export const POST = adminRoute(async (_req, admin) => {
  // Needs the energy-data columns and the tier columns.
  const probe = await db().from("tariffs").select("price_tiers, updated_by, segment").limit(1);
  if (probe.error) return json({ error: /price_tiers|updated_by|segment|column/i.test(probe.error.message) ? "missing_tiers" : probe.error.message }, probe.error ? 409 : 500);

  const provs = await db().from("energy_providers").select("*");
  const providers = (provs.data ?? []) as Provider[];
  const providerId = (name: string) =>
    providers.find((p) => normKey(p.name) === normKey(name) || p.aliases.some((a) => normKey(a) === normKey(name)))?.id ?? null;

  const old = must(await db().from("tariffs").select("*").eq("category", "electricity").eq("segment", "residential")) as Record<string, unknown>[];
  const ids = old.map((r) => r.id as string);
  if (ids.length) {
    must(await db().from("tariffs").update({ updated_by: admin }).in("id", ids));
    must(await db().from("tariffs").delete().in("id", ids));
  }

  const now = new Date().toISOString();
  const rows = raaey.tariffs.map((t) => ({
    id: t.id, category: "electricity", segment: "residential", provider: t.provider, provider_id: providerId(t.provider),
    name: t.name, color: t.color, fixed_monthly_eur: t.fixed_monthly_eur, price_per_kwh_eur: t.price_per_kwh_eur,
    price_per_kwh_with_discount_eur: null, discount_condition: (t as { discount_condition?: string }).discount_condition ?? null,
    min_duration_months: (t as { min_duration_months?: number }).min_duration_months ?? null,
    conditions: (t as { conditions?: string }).conditions ?? null,
    day_night: (t as { day_night?: boolean }).day_night ?? false,
    price_per_kwh_night_eur: (t as { price_per_kwh_night_eur?: number }).price_per_kwh_night_eur ?? null,
    price_tiers: (t as { price_tiers?: unknown }).price_tiers ?? null,
    fee_tiers: (t as { fee_tiers?: unknown }).fee_tiers ?? null,
    tier_mode: (t as { tier_mode?: string }).tier_mode ?? null,
    valid_month: t.valid_month, url: t.url, active: true,
    data_status: "verified", last_verified_at: now, updated_by: admin, updated_at: now,
  }));
  must(await db().from("tariffs").upsert(rows, { onConflict: "id" }));

  await logActivity({
    admin, action: "tariff_import", entity: "tariffs", before: { removed: ids }, after: { added: rows.map((r) => r.id) },
    source_url: "https://energycost.gr/", note: `Αντικατάσταση οικιακών ρεύματος με τη λίστα ΡΑΑΕΥ (${raaey.source})`,
  });
  return json({ removed: ids.length, added: rows.length });
});

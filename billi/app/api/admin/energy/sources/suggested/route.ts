import suggested from "@/data/sources.json";
import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";
import type { Provider } from "@/lib/energy/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adds the official price pages listed in data/sources.json that aren't sources yet. */
export const POST = adminRoute(async (_req, admin) => {
  const providers = must(await db().from("energy_providers").select("*")) as Provider[];
  const existing = new Set((must(await db().from("tariff_data_sources").select("url")) as { url: string }[]).map((s) => s.url));
  const rows = suggested.sources
    .filter((s) => !existing.has(s.url))
    .map((s) => ({ provider_id: providers.find((p) => p.slug === s.provider)?.id ?? null, label: s.label, url: s.url, kind: s.kind, segment: (s as { segment?: string }).segment ?? "residential" }));
  if (rows.length) must(await db().from("tariff_data_sources").insert(rows).select("id"));
  await logActivity({ admin, action: "source_create", entity: "tariff_data_sources", after: { added: rows.map((r) => r.url) }, note: "Προτεινόμενες πηγές" });
  return json({ added: rows.length, total: suggested.sources.length });
});

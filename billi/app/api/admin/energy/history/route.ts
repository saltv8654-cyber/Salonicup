import { db } from "@/lib/db";
import { adminRoute, json, must } from "@/lib/energy/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Price history: ?tariff_id=… for one programme, otherwise the programmes with their number of changes. */
export const GET = adminRoute(async (req) => {
  const id = req.nextUrl.searchParams.get("tariff_id");
  if (id) {
    const [history, current] = await Promise.all([
      db().from("tariff_price_history").select("*").eq("tariff_id", id).order("changed_at", { ascending: true }).limit(1000),
      db().from("tariffs").select("*").eq("id", id).maybeSingle(),
    ]);
    return json({ history: must(history), current: must(current) });
  }
  const rows = must(await db().from("tariff_price_history").select("tariff_id, provider, name, changed_at, change, price_per_kwh_eur, active").order("changed_at", { ascending: false }).limit(5000)) as
    { tariff_id: string; provider: string; name: string; changed_at: string; change: string; price_per_kwh_eur: number | string | null; active: boolean | null }[];
  const by = new Map<string, { tariff_id: string; provider: string; name: string; changes: number; last_change_at: string; last_change: string; price: number | null; active: boolean | null }>();
  for (const r of rows) {
    const cur = by.get(r.tariff_id);
    if (cur) cur.changes++;
    else by.set(r.tariff_id, { tariff_id: r.tariff_id, provider: r.provider, name: r.name, changes: 1, last_change_at: r.changed_at, last_change: r.change, price: r.price_per_kwh_eur === null ? null : Number(r.price_per_kwh_eur), active: r.active });
  }
  return json({ programmes: [...by.values()].sort((a, b) => a.provider.localeCompare(b.provider, "el") || a.name.localeCompare(b.name, "el")) });
});

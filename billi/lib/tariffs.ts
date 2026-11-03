import { get, put } from "@vercel/blob";
import bundled from "@/data/tariffs.json";
import type { Tariff, TariffFile } from "./types";
import { db, dbConfigured } from "./db";

const PATH = "tariffs/latest.json";

/** A connected store exposes either a read-write token or, on newer projects, a store id used with Vercel OIDC. */
export const blobConfigured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

export interface TariffRow {
  id: string;
  created_at: string;
  updated_at: string;
  provider: string;
  name: string;
  color: Tariff["color"];
  fixed_monthly_eur: number;
  price_per_kwh_eur: number;
  price_per_kwh_with_discount_eur: number | null;
  discount_condition: string | null;
  min_duration_months: number | null;
  valid_month: string;
  url: string | null;
  active: boolean;
}

/** Supabase numerics arrive as strings; nulls become absent fields like in the JSON file. */
export function rowToTariff(r: TariffRow): Tariff {
  const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  return {
    id: r.id,
    category: "electricity",
    provider: r.provider,
    name: r.name,
    color: r.color,
    fixed_monthly_eur: Number(r.fixed_monthly_eur),
    price_per_kwh_eur: Number(r.price_per_kwh_eur),
    price_per_kwh_with_discount_eur: n(r.price_per_kwh_with_discount_eur),
    discount_condition: r.discount_condition ?? undefined,
    min_duration_months: n(r.min_duration_months),
    valid_month: r.valid_month,
    url: r.url ?? undefined,
  };
}

/** Tariffs edited in /admin, or null when the table is missing or still empty. */
async function loadFromDb(): Promise<TariffFile | null> {
  if (!dbConfigured()) return null;
  const { data, error } = await db().from("tariffs").select("*").eq("active", true).order("provider").limit(1000);
  if (error || !data || data.length === 0) return null;
  const rows = data as TariffRow[];
  return {
    updated_at: rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), rows[0].updated_at),
    source: "Τιμές από το Billi CRM",
    tariffs: rows.map(rowToTariff),
  };
}

/** Admin-edited tariffs first, then the synced Blob snapshot, then the bundled file. */
export async function loadTariffs(): Promise<TariffFile> {
  try {
    const fromDb = await loadFromDb();
    if (fromDb) return fromDb;
  } catch (e) {
    console.error("loadTariffs (db):", e);
  }
  if (!blobConfigured()) return bundled as TariffFile;
  try {
    const res = await get(PATH, { access: "public", useCache: false });
    if (res) return (await new Response(res.stream).json()) as TariffFile;
  } catch (e) {
    console.error("loadTariffs:", e);
  }
  return bundled as TariffFile;
}

export const bundledTariffs = () => bundled as TariffFile;

export async function saveTariffs(data: TariffFile) {
  await put(PATH, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}

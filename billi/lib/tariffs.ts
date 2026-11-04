import bundled from "@/data/tariffs.json";
import bundledTelecom from "@/data/telecom.json";
import bundledGas from "@/data/gas.json";
import type { EnergyCategory, Tariff, TariffFile, TelecomFile, TelecomPlan } from "./types";
import { db, dbConfigured } from "./db";

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
  /** missing before the gas upgrade (= electricity) */
  category?: EnergyCategory;
  /** the columns below arrive with the energy-data migration */
  segment?: "residential" | "business";
  day_night?: boolean;
  price_per_kwh_night_eur?: number | string | null;
  promo_discount?: string | null;
  early_termination_fee?: string | null;
  conditions?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  last_verified_at?: string | null;
  data_status?: "verified" | "unverified";
}

/** Supabase numerics arrive as strings; nulls become absent fields like in the JSON file. */
export function rowToTariff(r: TariffRow): Tariff {
  const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  return {
    id: r.id,
    category: r.category ?? "electricity",
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
    day_night: r.day_night || undefined,
    price_per_kwh_night_eur: n(r.price_per_kwh_night_eur),
    promo_discount: r.promo_discount ?? undefined,
    early_termination_fee: r.early_termination_fee ?? undefined,
    conditions: r.conditions ?? undefined,
    valid_from: r.valid_from ?? undefined,
    valid_until: r.valid_until ?? undefined,
    last_verified_at: r.last_verified_at ?? undefined,
    data_status: r.data_status ?? "unverified",
  };
}

/** Tariffs of one category edited in /admin, or null when there are none there yet. */
export type Segment = "residential" | "business";

async function loadFromDb(category: EnergyCategory, segment: Segment = "residential"): Promise<TariffFile | null> {
  if (!dbConfigured()) return null;
  const { data, error } = await db().from("tariffs").select("*").eq("active", true).order("provider").limit(1000);
  if (error || !data) return null;
  // Only published, active, residential programmes reach visitors; pending changes live in tariff_update_queue.
  const rows = (data as TariffRow[]).filter((r) => (r.category ?? "electricity") === category && (r.segment ?? "residential") === segment);
  if (rows.length === 0) return null;
  return {
    updated_at: rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), rows[0].updated_at),
    source: "Τιμές από το Billi CRM",
    tariffs: rows.map(rowToTariff),
  };
}

/** Published tariffs from the database first, then the bundled indicative files (data/tariffs.json, data/gas.json). */
export async function loadTariffs(category: EnergyCategory = "electricity", segment: Segment = "residential"): Promise<TariffFile> {
  try {
    const fromDb = await loadFromDb(category, segment);
    if (fromDb) return fromDb;
  } catch (e) {
    console.error("loadTariffs (db):", e);
  }
  // The bundled files are household programmes only.
  return segment === "business" ? { updated_at: null, source: "", tariffs: [] } : bundledTariffs(category);
}

export const bundledTariffs = (category: EnergyCategory = "electricity") =>
  (category === "gas" ? bundledGas : bundled) as TariffFile;

export interface TelecomRow {
  id: string;
  created_at: string;
  updated_at: string;
  kind: "internet" | "mobile";
  provider: string;
  name: string;
  monthly_eur: number | string;
  promo_eur: number | string | null;
  promo_months: number | null;
  commitment_months: number | null;
  speed_mbps: number | null;
  tech: string | null;
  data_gb: number | string | null;
  notes: string | null;
  valid_month: string;
  url: string | null;
  active: boolean;
}

export function rowToPlan(r: TelecomRow): TelecomPlan {
  const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  return {
    id: r.id, kind: r.kind, provider: r.provider, name: r.name,
    monthly_eur: Number(r.monthly_eur), promo_eur: n(r.promo_eur), promo_months: n(r.promo_months),
    commitment_months: n(r.commitment_months), speed_mbps: n(r.speed_mbps), tech: r.tech ?? undefined,
    data_gb: n(r.data_gb), notes: r.notes ?? undefined, valid_month: r.valid_month, url: r.url ?? undefined,
  };
}

export const bundledTelecomFile = () => bundledTelecom as TelecomFile;

/** Internet / mobile plans: edited in /admin when the table has any, otherwise the bundled indicative list. */
export async function loadTelecom(): Promise<TelecomFile> {
  if (dbConfigured()) {
    try {
      const { data, error } = await db().from("telecom_plans").select("*").eq("active", true).limit(1000);
      if (!error && data && data.length > 0) {
        const rows = data as TelecomRow[];
        return {
          updated_at: rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), rows[0].updated_at),
          source: "Τιμές από το Billi CRM",
          plans: rows.map(rowToPlan),
        };
      }
    } catch (e) {
      console.error("loadTelecom (db):", e);
    }
  }
  return bundledTelecomFile();
}

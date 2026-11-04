import type { TariffColor } from "../types";

/** One electricity programme as Billi stores it (supply charges, € without VAT). */
export interface TariffValues {
  provider: string;
  name: string;
  color: TariffColor | null;
  segment: "residential" | "business";
  fixed_monthly_eur: number | null;
  price_per_kwh_eur: number | null;
  day_night: boolean;
  price_per_kwh_night_eur: number | null;
  price_per_kwh_with_discount_eur: number | null;
  discount_condition: string | null;
  promo_discount: string | null;
  min_duration_months: number | null;
  early_termination_fee: string | null;
  conditions: string | null;
  valid_from: string | null;
  valid_until: string | null;
  valid_month: string | null;
  url: string | null;
}

export const PRICE_FIELDS = [
  "color", "fixed_monthly_eur", "price_per_kwh_eur", "day_night", "price_per_kwh_night_eur", "price_per_kwh_with_discount_eur",
] as const satisfies readonly (keyof TariffValues)[];
export const DETAIL_FIELDS = [
  "segment", "discount_condition", "promo_discount", "min_duration_months", "early_termination_fee", "conditions", "valid_from", "valid_until",
] as const satisfies readonly (keyof TariffValues)[];

export const FIELD_LABEL: Record<keyof TariffValues, string> = {
  provider: "Πάροχος", name: "Πρόγραμμα", color: "Χρώμα", segment: "Τύπος πελάτη",
  fixed_monthly_eur: "Πάγιο €/μήνα", price_per_kwh_eur: "Τιμή €/kWh", day_night: "Ημέρα/νύχτα",
  price_per_kwh_night_eur: "Νυχτερινή €/kWh", price_per_kwh_with_discount_eur: "Με έκπτωση συνέπειας €/kWh",
  discount_condition: "Όρος έκπτωσης", promo_discount: "Προωθητική έκπτωση", min_duration_months: "Διάρκεια (μήνες)",
  early_termination_fee: "Πρόωρη λήξη", conditions: "Λοιποί όροι", valid_from: "Ισχύει από", valid_until: "Ισχύει έως",
  valid_month: "Μήνας τιμής", url: "Πηγή",
};

export type FlagLevel = "error" | "warning";
export interface Flag { code: string; level: FlagLevel; message: string }

/** Flags from comparing with the source document; they stay after an edit, while field checks are redone. */
export const SOURCE_FLAG_CODES = ["duplicate", "unknown_provider", "no_evidence", "price_not_in_source", "fee_not_in_source", "no_document", "vat_removed", "missing_from_source"];

export type ChangeType = "new" | "price_change" | "details_change" | "discontinued";
export type QueueStatus = "pending" | "approved" | "rejected" | "superseded";

export interface Provider {
  id: string; slug: string; name: string; aliases: string[]; website: string | null; active: boolean; notes: string | null;
  created_at: string; updated_at: string;
}

export interface Source {
  id: string; provider_id: string | null; label: string; url: string; kind: "auto" | "html" | "pdf" | "site";
  /** set on pages found automatically from a "site" source */
  discovered_from?: string | null;
  segment: "residential" | "business" | "both"; enabled: boolean; check_every_hours: number;
  last_checked_at: string | null; last_success_at: string | null; last_status: "ok" | "unchanged" | "failed" | null;
  last_error: string | null; last_hash: string | null; last_document_path: string | null; notes: string | null;
  created_at: string; updated_at: string;
}

export interface QueueItem {
  id: string; created_at: string; updated_at: string; run_id: string | null; source_id: string | null; provider_id: string | null;
  provider: string; program: string; dedupe_key: string; tariff_id: string | null; change_type: ChangeType;
  old_values: TariffValues | null; new_values: TariffValues | null; changed_fields: string[]; flags: Flag[];
  status: QueueStatus; notes: string | null; reviewed_by: string | null; reviewed_at: string | null;
  source_url: string | null; source_document: string | null; evidence: string | null;
}

export interface RunLog {
  id: string; started_at: string; finished_at: string | null; trigger: "cron" | "manual"; admin: string | null;
  source_id: string | null; provider_id: string | null; status: "running" | "ok" | "unchanged" | "failed"; message: string | null;
  found: number; queued: number; verified: number; document_hash: string | null; document_path: string | null;
  documents: { url: string; path: string | null; type: string }[];
}

/** A published `tariffs` row as PostgREST returns it (numerics may come back as strings). */
export type TariffRowAny = Record<string, unknown> & { id: string; provider: string; name: string; active: boolean };

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function rowToValues(r: TariffRowAny): TariffValues {
  return {
    provider: r.provider, name: r.name, color: (r.color as TariffColor) ?? null,
    segment: r.segment === "business" ? "business" : "residential",
    fixed_monthly_eur: num(r.fixed_monthly_eur), price_per_kwh_eur: num(r.price_per_kwh_eur),
    day_night: r.day_night === true, price_per_kwh_night_eur: num(r.price_per_kwh_night_eur),
    price_per_kwh_with_discount_eur: num(r.price_per_kwh_with_discount_eur),
    discount_condition: txt(r.discount_condition), promo_discount: txt(r.promo_discount),
    min_duration_months: num(r.min_duration_months), early_termination_fee: txt(r.early_termination_fee),
    conditions: txt(r.conditions), valid_from: txt(r.valid_from), valid_until: txt(r.valid_until),
    valid_month: txt(r.valid_month), url: txt(r.url),
  };
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    if (a === null || b === null || a === undefined || b === undefined) return a == b;
    return Math.abs(Number(a) - Number(b)) < 1e-6;
  }
  const norm = (v: unknown) => (v === undefined || v === "" ? null : typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);
  return norm(a) === norm(b);
}

export const changedFields = (oldV: TariffValues, newV: TariffValues, fields: readonly (keyof TariffValues)[]) =>
  fields.filter((f) => !sameValue(oldV[f], newV[f]));

/** Matching key: accents, case and punctuation don't matter ("Power Home Save 3.0" = "power home save 3 0"). */
export const normKey = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9Ͱ-Ͽ]+/g, " ").trim();

export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });
export const thisMonth = () => today().slice(0, 7);

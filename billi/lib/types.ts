export type TariffColor = "blue" | "green" | "yellow" | "orange";

export const COLOR_INFO: Record<TariffColor, { label: string; emoji: string; description: string }> = {
  blue:   { label: "Μπλε",      emoji: "🔵", description: "Σταθερή τιμή για όλη τη διάρκεια της σύμβασης" },
  green:  { label: "Πράσινο",   emoji: "🟢", description: "Κυμαινόμενη τιμή που ανακοινώνεται την 1η κάθε μήνα" },
  yellow: { label: "Κίτρινο",   emoji: "🟡", description: "Κυμαινόμενη τιμή με βάση τη χονδρεμπορική, γνωστή μετά την κατανάλωση" },
  orange: { label: "Πορτοκαλί", emoji: "🟠", description: "Δυναμική ωριαία τιμή, απαιτεί έξυπνο μετρητή" },
};

export interface Bill {
  provider: string | null;
  program_name: string | null;
  tariff_color: TariffColor | null;
  period_start: string | null;
  period_end: string | null;
  billing_days: number | null;
  kwh_total: number | null;
  kwh_day: number | null;
  kwh_night: number | null;
  kwh_rate: number | null;
  kwh_rate_night: number | null;
  fixed_monthly_fee: number | null;
  energy_charge_gross: number | null;
  consistency_discount: number | null;
  net_energy_charge: number | null;
  supplier_total: number | null;
  regulated_total: number | null;
  municipal_total: number | null;
  efk_total: number | null;
  vat_amount: number | null;
  total_due: number | null;
  is_estimate: boolean | null;
}

/** One retail electricity programme as published by the provider (supply charges, without VAT). */
export interface Tariff {
  id: string;
  category: "electricity";
  provider: string;
  name: string;
  color: TariffColor;
  /** €/month */
  fixed_monthly_eur: number;
  /** €/kWh, already net of any discount the customer gets unconditionally */
  price_per_kwh_eur: number;
  /** €/kWh with the conditional discount (e.g. on-time payment) applied, if any */
  price_per_kwh_with_discount_eur?: number;
  discount_condition?: string;
  min_duration_months?: number;
  /** YYYY-MM the price applies to (green tariffs change monthly) */
  valid_month: string;
  url?: string;
}

export interface TariffFile {
  updated_at: string | null;
  source: string;
  tariffs: Tariff[];
}

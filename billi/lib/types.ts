export type TariffColor = "blue" | "green" | "yellow" | "orange";

export interface ColorInfo {
  label: string;
  emoji: string;
  description: string;
  /** When this kind of tariff pays off */
  when: string;
  /** What to watch out for */
  risk: string;
}

export const COLOR_INFO: Record<TariffColor, ColorInfo> = {
  blue: {
    label: "Μπλε", emoji: "🔵",
    description: "Σταθερή τιμή για όλη τη διάρκεια της σύμβασης",
    when: "θέλεις σιγουριά και σταθερό λογαριασμό, ή οι τιμές της αγοράς ανεβαίνουν και θες να «κλειδώσεις» μια καλή τιμή.",
    risk: "συνήθως έχει δέσμευση (π.χ. 12 μήνες) και πιθανή χρέωση πρόωρης αποχώρησης. Αν πέσουν οι τιμές, δεν το κερδίζεις.",
  },
  green: {
    label: "Πράσινο", emoji: "🟢",
    description: "Κυμαινόμενη τιμή που ανακοινώνεται την 1η κάθε μήνα",
    when: "οι τιμές της αγοράς πέφτουν ή είναι χαμηλές, και θέλεις ευελιξία χωρίς δέσμευση. Ξέρεις την τιμή πριν καταναλώσεις.",
    risk: "η τιμή αλλάζει κάθε μήνα και μπορεί να ανέβει απότομα (τον Νοέμβριο 2026 κάποια ανέβηκαν έως 76%). Θέλει έλεγχο κάθε μήνα.",
  },
  yellow: {
    label: "Κίτρινο", emoji: "🟡",
    description: "Κυμαινόμενη τιμή με βάση τη χονδρεμπορική, γνωστή μετά την κατανάλωση",
    when: "περιμένεις πτώση της χονδρεμπορικής και δέχεσαι ρίσκο. Σε φθηνούς μήνες μπορεί να βγει το φθηνότερο.",
    risk: "μαθαίνεις την τιμή αφού καταναλώσεις. Σε περιόδους ακρίβειας ο λογαριασμός μπορεί να ξεφύγει.",
  },
  orange: {
    label: "Πορτοκαλί", emoji: "🟠",
    description: "Δυναμική ωριαία τιμή, απαιτεί έξυπνο μετρητή",
    when: "έχεις έξυπνο μετρητή και μπορείς να μεταφέρεις κατανάλωση σε φθηνές ώρες (π.χ. μεσημέρι, νύχτα): ηλεκτρικό αυτοκίνητο, θερμοσίφωνας ή πλυντήρια με χρονοδιακόπτη.",
    risk: "οι ώρες αιχμής (απόγευμα-βράδυ) είναι ακριβές. Χωρίς έξυπνο μετρητή δεν διατίθεται.",
  },
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

export type Category = "electricity" | "gas" | "telecom";
export type EnergyCategory = Exclude<Category, "telecom">;

export const CATEGORY_INFO: Record<Category, { label: string; emoji: string; bill: string }> = {
  electricity: { label: "Ρεύμα", emoji: "⚡", bill: "λογαριασμό ρεύματος" },
  gas: { label: "Αέριο", emoji: "🔥", bill: "λογαριασμό φυσικού αερίου" },
  telecom: { label: "Internet & Κινητή", emoji: "📶", bill: "λογαριασμό internet ή κινητής" },
};

/** One retail electricity or gas programme as published by the provider (supply charges, without VAT). */
export interface Tariff {
  id: string;
  category: EnergyCategory;
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

/** A home internet or mobile plan. Prices incl. VAT, as advertised. */
export interface TelecomPlan {
  id: string;
  kind: "internet" | "mobile";
  provider: string;
  name: string;
  /** €/month after any promo period */
  monthly_eur: number;
  /** €/month during the promo period, if any */
  promo_eur?: number;
  promo_months?: number;
  commitment_months?: number;
  /** internet: download speed */
  speed_mbps?: number;
  /** internet: FTTH, VDSL, 5G/FWA … */
  tech?: string;
  /** mobile: data per month; omitted = unlimited */
  data_gb?: number;
  notes?: string;
  valid_month: string;
  url?: string;
}

export interface TelecomFile {
  updated_at: string | null;
  source: string;
  plans: TelecomPlan[];
}

/** What we read from a telecom bill. */
export interface TelecomBill {
  provider: string | null;
  plan_name: string | null;
  has_internet: boolean;
  has_mobile: boolean;
  internet_speed_mbps: number | null;
  internet_monthly_eur: number | null;
  mobile_lines: number | null;
  mobile_data_gb: number | null;
  mobile_unlimited_data: boolean | null;
  mobile_monthly_eur: number | null;
  total_due: number | null;
  period_start: string | null;
  period_end: string | null;
}

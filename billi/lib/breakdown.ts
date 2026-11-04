import type { Bill } from "./types";

/** Where the money on an electricity bill goes. Only the supply part changes with the provider. */
export interface BreakdownGroup {
  key: "supply" | "regulated" | "taxes" | "other";
  label: string;
  amount: number;
  /** changes if you switch provider */
  switchable: boolean;
  items: { label: string; amount: number }[];
}

export interface Breakdown {
  groups: BreakdownGroup[];
  /** supply + regulated + taxes for this period */
  periodTotal: number;
  totalDue: number | null;
  /** sum of the groups differs from the total due by more than 1 € */
  mismatch: boolean;
  avgDailyKwh: number | null;
  supplyShare: number | null;
}

const v = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : null);
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

export function breakdown(b: Bill): Breakdown | null {
  const fee = v(b.fixed_monthly_fee);
  const energy = v(b.energy_charge_gross);
  const consistency = v(b.consistency_discount);
  const promo = v(b.promo_discount);
  const supplyItems = [
    fee !== null && { label: "Πάγιο", amount: fee },
    energy !== null && { label: "Ενέργεια (kWh × τιμή)", amount: energy },
    consistency && { label: "Έκπτωση συνέπειας", amount: -consistency },
    promo && { label: "Προωθητική έκπτωση", amount: -promo },
  ].filter(Boolean) as { label: string; amount: number }[];
  const supply = v(b.supplier_total) ?? (supplyItems.length ? sum(supplyItems.map((i) => i.amount)) : null);

  const regItems = [
    ["Δίκτυο (ΔΕΔΔΗΕ, ΑΔΜΗΕ)", b.network_charges], ["Χρήση Συστήματος (ΥΧΣ)", b.system_charges],
    ["Υπηρεσίες Κοινής Ωφέλειας (ΥΚΩ)", b.pso_charges], ["ΕΤΜΕΑΡ", b.etmear], ["Λοιπές ρυθμιζόμενες", b.other_regulated],
  ].flatMap(([l, n]) => (v(n as number) !== null ? [{ label: l as string, amount: n as number }] : []));
  const regulated = v(b.regulated_total) ?? (regItems.length ? sum(regItems.map((i) => i.amount)) : null);

  const taxItems = [
    ["ΕΦΚ", b.efk_total], ["Ειδικό τέλος 5‰", b.special_levy], ["ΦΠΑ", b.vat_amount],
    ["Δημοτικά τέλη, φόρος, ΤΑΠ", b.municipal_total], ["ΕΡΤ", b.ert_fee],
  ].flatMap(([l, n]) => (v(n as number) !== null ? [{ label: l as string, amount: n as number }] : []));
  const taxes = taxItems.length ? sum(taxItems.map((i) => i.amount)) : null;

  const otherItems = [
    ["Προηγούμενο υπόλοιπο", v(b.previous_balance)], ["Πληρωμές", v(b.payments_received) !== null ? -b.payments_received! : null],
    ["Πιστώσεις / συμψηφισμοί", v(b.credits) !== null ? -b.credits! : null], ["Εγγύηση", v(b.deposit)], ["Άλλες χρεώσεις", v(b.other_charges)],
  ].flatMap(([l, n]) => (n !== null && n !== 0 ? [{ label: l as string, amount: n as number }] : []));
  const other = otherItems.length ? sum(otherItems.map((i) => i.amount)) : 0;

  if (supply === null && regulated === null && taxes === null) return null;
  const groups: BreakdownGroup[] = [
    { key: "supply", label: "Προμήθεια ρεύματος", amount: supply ?? 0, switchable: true, items: supplyItems },
    { key: "regulated", label: "Ρυθμιζόμενες χρεώσεις", amount: regulated ?? 0, switchable: false, items: regItems },
    { key: "taxes", label: "Φόροι & δημοτικά τέλη", amount: taxes ?? 0, switchable: false, items: taxItems },
  ];
  if (otherItems.length) groups.push({ key: "other", label: "Λοιπά (υπόλοιπα, πληρωμές, εγγύηση)", amount: other, switchable: false, items: otherItems });

  const periodTotal = (supply ?? 0) + (regulated ?? 0) + (taxes ?? 0);
  const totalDue = v(b.total_due);
  const days = v(b.billing_days);
  return {
    groups,
    periodTotal,
    totalDue,
    mismatch: totalDue !== null && Math.abs(periodTotal + other - totalDue) > 1,
    avgDailyKwh: b.kwh_total && days ? b.kwh_total / days : null,
    supplyShare: supply !== null && periodTotal > 0 ? supply / periodTotal : null,
  };
}

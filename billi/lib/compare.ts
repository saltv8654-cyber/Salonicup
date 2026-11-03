import type { Bill, Tariff, TariffColor } from "./types";
import { COLOR_INFO } from "./types";

const VAT = 0.06;

export interface Offer {
  tariff: Tariff;
  /** annual supply cost incl. VAT, € */
  annual: number;
  /** annual cost with the conditional discount applied, if the tariff has one */
  annualWithDiscount: number | null;
  /** positive = cheaper than the current programme */
  savings: number | null;
}

export interface Comparison {
  annualKwh: number;
  currentAnnual: number | null;
  offers: Offer[];
  /** Cheapest offer of each tariff colour, for the "which colour suits you" view */
  byColor: Record<TariffColor, Offer | null>;
  recommendation: { color: TariffColor; text: string } | null;
}

function supplyCost(kwh: number, fixedMonthly: number, pricePerKwh: number) {
  return (fixedMonthly * 12 + kwh * pricePerKwh) * (1 + VAT);
}

/** Linear extrapolation of the billed period to a year. */
export function annualKwh(bill: Bill): number {
  const days = bill.billing_days && bill.billing_days > 0 ? bill.billing_days : 30;
  return Math.round(((bill.kwh_total ?? 0) / days) * 365);
}

/**
 * What the customer pays for supply today, per year incl. VAT. Prefer the supplier total actually
 * charged on the bill (fixed fee + energy − discounts), scaled to a year; it needs no assumptions
 * about how the provider pro-rates the fixed fee.
 */
function currentAnnualCost(bill: Bill, kwh: number): number | null {
  const days = bill.billing_days && bill.billing_days > 0 ? bill.billing_days : null;
  if (bill.supplier_total && days) return bill.supplier_total * (365 / days) * (1 + VAT);
  if (bill.fixed_monthly_fee === null) return null;
  const rate =
    bill.net_energy_charge && bill.kwh_total ? bill.net_energy_charge / bill.kwh_total : bill.kwh_rate;
  return rate !== null ? supplyCost(kwh, bill.fixed_monthly_fee, rate) : null;
}

export function compare(bill: Bill, tariffs: Tariff[]): Comparison {
  const kwh = annualKwh(bill);
  const currentAnnual = currentAnnualCost(bill, kwh);

  const offers: Offer[] = tariffs
    .map((t) => {
      const annual = supplyCost(kwh, t.fixed_monthly_eur, t.price_per_kwh_eur);
      const annualWithDiscount =
        t.price_per_kwh_with_discount_eur !== undefined
          ? supplyCost(kwh, t.fixed_monthly_eur, t.price_per_kwh_with_discount_eur)
          : null;
      const best = annualWithDiscount ?? annual;
      return { tariff: t, annual, annualWithDiscount, savings: currentAnnual !== null ? currentAnnual - best : null };
    })
    .sort((a, b) => (a.annualWithDiscount ?? a.annual) - (b.annualWithDiscount ?? b.annual));

  const byColor = Object.fromEntries(
    (["blue", "green", "yellow", "orange"] as TariffColor[]).map((c) => [c, offers.find((o) => o.tariff.color === c) ?? null]),
  ) as Record<TariffColor, Offer | null>;

  return { annualKwh: kwh, currentAnnual, offers, byColor, recommendation: recommend(offers) };
}

function recommend(offers: Offer[]): Comparison["recommendation"] {
  // Orange needs a smart meter, which most households don't have yet.
  const eligible = offers.filter((o) => o.tariff.color !== "orange");
  if (eligible.length === 0) return null;

  const cost = (o: Offer) => o.annualWithDiscount ?? o.annual;
  const cheapest = eligible[0];
  const cheapestBlue = eligible.find((o) => o.tariff.color === "blue");

  // A fixed price is worth a small premium: no surprises when wholesale prices spike.
  if (cheapestBlue && cheapestBlue !== cheapest && cost(cheapestBlue) <= cost(cheapest) * 1.05) {
    const diff = cost(cheapestBlue) - cost(cheapest);
    return {
      color: "blue",
      text: `Το φθηνότερο μπλε (σταθερό) κοστίζει μόλις ${diff.toFixed(0)} €/έτος παραπάνω από το φθηνότερο συνολικά. Αξίζει για σιγουριά τιμής.`,
    };
  }

  const c = cheapest.tariff.color;
  const caveat: Record<TariffColor, string> = {
    blue: "Η τιμή μένει σταθερή, χωρίς εκπλήξεις.",
    green: "Η τιμή αλλάζει κάθε μήνα, αλλά την ξέρεις πριν καταναλώσεις. Έλεγξε ξανά σε λίγους μήνες.",
    yellow: "Η τιμή ακολουθεί τη χονδρεμπορική και τη μαθαίνεις αφού καταναλώσεις. Σε περιόδους ακρίβειας μπορεί να ανέβει απότομα.",
    orange: "",
  };
  return { color: c, text: `${COLOR_INFO[c].label} τιμολόγιο: το φθηνότερο για την κατανάλωσή σου. ${caveat[c]}` };
}

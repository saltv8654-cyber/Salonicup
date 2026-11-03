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

/** Effective €/kWh the customer currently pays for supply, after discounts. */
function currentRate(bill: Bill): number | null {
  if (bill.net_energy_charge && bill.kwh_total) return bill.net_energy_charge / bill.kwh_total;
  return bill.kwh_rate;
}

export function compare(bill: Bill, tariffs: Tariff[]): Comparison {
  const kwh = annualKwh(bill);
  const rate = currentRate(bill);
  const currentAnnual =
    rate !== null && bill.fixed_monthly_fee !== null ? supplyCost(kwh, bill.fixed_monthly_fee, rate) : null;

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

  return { annualKwh: kwh, currentAnnual, offers, recommendation: recommend(offers) };
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

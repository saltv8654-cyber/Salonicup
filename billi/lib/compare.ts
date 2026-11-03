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
  recommendation: { color: TariffColor; text: string; reasons: string[] } | null;
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

  return { annualKwh: kwh, currentAnnual, offers, byColor, recommendation: recommend(offers, currentAnnual, kwh) };
}

const fmt = (n: number) => `${Math.round(n).toLocaleString("el-GR")} €`;

function recommend(offers: Offer[], currentAnnual: number | null, kwh: number): Comparison["recommendation"] {
  // Orange needs a smart meter, which most households don't have yet.
  const eligible = offers.filter((o) => o.tariff.color !== "orange");
  if (eligible.length === 0) return null;

  const cost = (o: Offer) => o.annualWithDiscount ?? o.annual;
  const cheapest = eligible[0];
  const cheapestBlue = eligible.find((o) => o.tariff.color === "blue");

  // A fixed price is worth a small premium: no surprises when wholesale prices spike.
  const blueByPremium = !!cheapestBlue && cheapestBlue !== cheapest && cost(cheapestBlue) <= cost(cheapest) * 1.05;
  const pick = blueByPremium ? cheapestBlue! : cheapest;
  const color = pick.tariff.color;
  const label = COLOR_INFO[color].label;

  const reasons: string[] = [];
  reasons.push(`Για ${kwh.toLocaleString("el-GR")} kWh τον χρόνο, το φθηνότερο ${label.toLowerCase()} είναι το ${pick.tariff.provider} ${pick.tariff.name}, με ~${fmt(cost(pick))}/έτος.`);

  // How it compares with the best option of every other colour.
  for (const other of ["blue", "green", "yellow"] as TariffColor[]) {
    if (other === color) continue;
    const best = eligible.find((o) => o.tariff.color === other);
    if (!best) continue;
    const diff = cost(best) - cost(pick);
    reasons.push(
      diff >= 0
        ? `Είναι ${fmt(diff)}/έτος φθηνότερο από το καλύτερο ${COLOR_INFO[other].label.toLowerCase()} (${best.tariff.provider}).`
        : `Το καλύτερο ${COLOR_INFO[other].label.toLowerCase()} (${best.tariff.provider}) είναι ${fmt(-diff)}/έτος φθηνότερο, αλλά χωρίς σταθερή τιμή.`,
    );
  }

  // Low consumption makes the fixed fee a big part of the bill.
  const fixedShare = (pick.tariff.fixed_monthly_eur * 12 * 1.06) / cost(pick);
  if (fixedShare >= 0.2) {
    reasons.push(`Με τη δική σου κατανάλωση το πάγιο είναι το ${Math.round(fixedShare * 100)}% του κόστους, γι' αυτό μετράει όσο και η τιμή της kWh.`);
  }
  // Low consumers often ask whether a no-fixed-fee plan with a pricier kWh would be cheaper: give the break-even.
  if (pick.tariff.fixed_monthly_eur > 0 && kwh > 0) {
    const breakEven = cost(pick) / (1 + VAT) / kwh;
    const zero = eligible.find((o) => o.tariff.fixed_monthly_eur === 0);
    let line = `Ένα πρόγραμμα χωρίς πάγιο θα σε συνέφερε μόνο αν η kWh του ήταν κάτω από ~${breakEven.toFixed(3).replace(".", ",")} €.`;
    if (zero) {
      const zp = zero.tariff.price_per_kwh_with_discount_eur ?? zero.tariff.price_per_kwh_eur;
      const diff = cost(zero) - cost(pick);
      line += diff > 0
        ? ` Το φθηνότερο χωρίς πάγιο (${zero.tariff.provider} ${zero.tariff.name}) έχει ${zp.toFixed(3).replace(".", ",")} €, άρα βγαίνει ~${fmt(diff)}/έτος ακριβότερο.`
        : ` Το ${zero.tariff.provider} ${zero.tariff.name} χωρίς πάγιο βγαίνει φθηνότερο, αλλά με κυμαινόμενη τιμή.`;
    }
    reasons.push(line);
  } else if (pick.tariff.fixed_monthly_eur === 0) {
    reasons.push("Δεν έχει πάγιο, κάτι που με χαμηλή κατανάλωση μετράει πολύ.");
  }
  if (pick.tariff.discount_condition) reasons.push(`Η τιμή ισχύει ${pick.tariff.discount_condition}.`);

  if (currentAnnual !== null) {
    const save = currentAnnual - cost(pick);
    if (save <= 0) {
      return {
        color,
        text: `Το τωρινό σου πρόγραμμα είναι ήδη φθηνότερο από κάθε διαθέσιμη επιλογή. Δεν σε συμφέρει να αλλάξεις.`,
        reasons: [...reasons, `Πληρώνεις ~${fmt(currentAnnual)}/έτος, ${fmt(-save)} λιγότερα από την καλύτερη εναλλακτική.`],
      };
    }
    reasons.push(
      save < 20
        ? `Θα γλίτωνες μόνο ~${fmt(save)}/έτος. Αν το τωρινό σου πρόγραμμα σού αρέσει, η αλλαγή ίσως δεν αξίζει τον κόπο.`
        : `Θα γλίτωνες ~${fmt(save)}/έτος σε σχέση με ό,τι πληρώνεις σήμερα.`,
    );
  }

  const text = blueByPremium
    ? `${label} τιμολόγιο. Κοστίζει μόλις ${fmt(cost(pick) - cost(cheapest))}/έτος παραπάνω από το φθηνότερο συνολικά, αλλά η τιμή μένει σταθερή.`
    : `${label} τιμολόγιο: το φθηνότερο για την κατανάλωσή σου.`;
  return { color, text, reasons };
}

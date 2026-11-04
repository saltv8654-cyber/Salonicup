import type { Comparison } from "./compare";
import type { Bill, TariffColor } from "./types";

/**
 * BILLI SCORE: 0–100, how well today's electricity plan fits the household.
 * Every point comes from a measured value (bill, verified tariffs, contract dates); nothing is a judgement call.
 */
export interface ScorePart {
  key: "cost" | "price" | "fee" | "stability" | "contract";
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface BilliScore {
  score: number;
  parts: ScorePart[];
  /** best verified alternative, € per year, never shown as guaranteed */
  potentialSavings: number;
  headline: string;
  actions: string[];
}

export interface ContractInfo {
  contract_end?: string | null;
  early_termination_fee?: string | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const eur = (n: number) => `${Math.round(n).toLocaleString("el-GR")} €`;
const eurKwh = (n: number) => `${n.toFixed(3).replace(".", ",")} €/kWh`;

/** Today's energy price per kWh, net of the discounts actually received. */
export function currentEnergyPrice(bill: Bill): number | null {
  if (bill.net_energy_charge !== null && bill.kwh_total) return bill.net_energy_charge / bill.kwh_total;
  return bill.kwh_rate;
}

/** Null when there is not enough measured data: today's cost and at least one verified alternative. */
export function billiScore(c: Comparison, bill: Bill, contract: ContractInfo = {}, today = new Date()): BilliScore | null {
  const pool = c.offers.filter((o) => !o.expired && o.tariff.color !== "orange");
  if (c.currentAnnual === null || c.currentAnnual <= 0 || pool.length === 0) return null;
  const cost = (o: (typeof pool)[number]) => o.annualWithDiscount ?? o.annual;
  const best = Math.min(...pool.map(cost));
  const savings = Math.max(0, c.currentAnnual - best);
  const savingShare = savings / c.currentAnnual;
  const parts: ScorePart[] = [];
  const actions: string[] = [];

  // 1. Total cost vs the cheapest verified alternative (50): 0% gap = 50, a gap of 40% or more = 0.
  const costPts = Math.round(50 * (1 - clamp(savingShare / 0.4)));
  parts.push({
    key: "cost", label: "Κόστος σε σχέση με την καλύτερη επιλογή", points: costPts, max: 50,
    detail: savings > 0 ? `Το φθηνότερο επιβεβαιωμένο πρόγραμμα κοστίζει ~${eur(savings)}/έτος λιγότερο (${Math.round(savingShare * 100)}%).` : "Πληρώνεις ήδη όσο το φθηνότερο διαθέσιμο πρόγραμμα ή λιγότερο.",
  });
  if (savings >= 20) actions.push(`Αλλαγή στο φθηνότερο πρόγραμμα: εκτιμώμενη εξοικονόμηση ~${eur(savings)}/έτος.`);

  // 2. Energy price vs the market (15): at or below the cheapest quarter = 15, at the most expensive tenth = 0.
  const price = currentEnergyPrice(bill);
  const prices = pool.map((o) => o.tariff.price_per_kwh_with_discount_eur ?? o.tariff.price_per_kwh_eur);
  if (price !== null && prices.length >= 2) {
    const p25 = quantile(prices, 0.25);
    const p90 = quantile(prices, 0.9);
    const pts = Math.round(15 * (1 - clamp((price - p25) / Math.max(p90 - p25, 0.001))));
    parts.push({ key: "price", label: "Τιμή kWh", points: pts, max: 15, detail: `Πληρώνεις ${eurKwh(price)}· τα φθηνότερα προγράμματα ξεκινούν από ${eurKwh(Math.min(...prices))}.` });
    if (pts < 8) actions.push("Η τιμή της kWh σου είναι από τις ακριβότερες: σύγκρινε προγράμματα με χαμηλότερη τιμή ενέργειας.");
  } else {
    parts.push({ key: "price", label: "Τιμή kWh", points: 8, max: 15, detail: "Ο λογαριασμός δεν δείχνει καθαρά την τιμή kWh· μετράει μέσος όρος." });
  }

  // 3. Fixed fee (10): at or below the median of the alternatives = 10, €10/month above it = 0.
  const fees = pool.map((o) => o.tariff.fixed_monthly_eur);
  if (bill.fixed_monthly_fee !== null) {
    const days = bill.billing_days && bill.billing_days > 0 ? bill.billing_days : 30;
    // The bill shows the fee for its period: a two-month bill carries two months of fee.
    const monthlyFee = days > 45 ? (bill.fixed_monthly_fee * 30.44) / days : bill.fixed_monthly_fee;
    const med = median(fees);
    const pts = Math.round(10 * (1 - clamp((monthlyFee - med) / 10)));
    parts.push({ key: "fee", label: "Πάγιο", points: pts, max: 10, detail: `Πάγιο ${eur(monthlyFee)}/μήνα· ο μέσος όρος των προγραμμάτων είναι ${eur(med)}.` });
    if (pts < 6 && c.annualKwh < 2500) actions.push("Με χαμηλή κατανάλωση το πάγιο βαραίνει πολύ: δες προγράμματα με χαμηλότερο ή μηδενικό πάγιο.");
  } else {
    parts.push({ key: "fee", label: "Πάγιο", points: 5, max: 10, detail: "Δεν βρέθηκε το πάγιο στον λογαριασμό· μετράει μέσος όρος." });
  }

  // 4. Price stability (10): fixed (blue) 10, monthly announced (green) 6, wholesale-linked (yellow) / dynamic (orange) 3.
  const color = bill.tariff_color as TariffColor | null;
  const stab: Record<TariffColor, number> = { blue: 10, green: 6, yellow: 3, orange: 3 };
  parts.push({
    key: "stability", label: "Σταθερότητα τιμής", points: color ? stab[color] : 5, max: 10,
    detail: color === "blue" ? "Σταθερή τιμή: προβλέψιμος λογαριασμός." : color ? "Κυμαινόμενη τιμή: ο λογαριασμός μπορεί να αλλάξει από μήνα σε μήνα." : "Δεν αναγνωρίστηκε το χρώμα τιμολογίου.",
  });
  if (color === "yellow" || color === "orange") actions.push("Αν θέλεις προβλέψιμο λογαριασμό, δες την πρόταση «Πιο σταθερό».");

  // 5. Contract (15): known end date far away = 15; ending within 60 days = 10 (act now); ended = 8; unknown = 10.
  let contractPts = 10;
  let contractDetail = "Πρόσθεσε τη λήξη της σύμβασής σου στο προφίλ για ειδοποίηση πριν λήξει.";
  if (contract.contract_end) {
    const days = Math.round((Date.parse(`${contract.contract_end}T00:00:00Z`) - today.getTime()) / 86_400_000);
    if (days < 0) {
      contractPts = 8;
      contractDetail = "Η σύμβασή σου έχει λήξει: μπορείς να αλλάξεις χωρίς χρέωση, αλλά ίσως πληρώνεις τιμή εκτός προσφοράς.";
      actions.push("Η σύμβασή σου έληξε: είναι καλή στιγμή να συγκρίνεις και να αλλάξεις.");
    } else if (days <= 60) {
      contractPts = 10;
      contractDetail = `Η σύμβασή σου λήγει σε ${days} ημέρες.`;
      actions.push(`Η σύμβαση λήγει σε ${days} ημέρες: σύγκρινε πριν ανανεωθεί αυτόματα.`);
    } else {
      contractPts = contract.early_termination_fee ? 12 : 15;
      contractDetail = `Η σύμβαση λήγει σε ${Math.round(days / 30.44)} μήνες${contract.early_termination_fee ? ` (πρόωρη λήξη: ${contract.early_termination_fee})` : ""}.`;
    }
  } else {
    actions.push("Συμπλήρωσε τη λήξη της σύμβασής σου για πιο ακριβές σκορ και υπενθύμιση.");
  }
  parts.push({ key: "contract", label: "Σύμβαση", points: contractPts, max: 15, detail: contractDetail });

  const score = Math.max(0, Math.min(100, parts.reduce((n, p) => n + p.points, 0)));
  const headline =
    score >= 85 ? "Το πρόγραμμά σου είναι ήδη από τα πιο συμφέροντα για την κατανάλωσή σου."
      : score >= 65 ? "Καλό πρόγραμμα, αλλά υπάρχει περιθώριο εξοικονόμησης."
      : "Το τωρινό σου πρόγραμμα μάλλον δεν είναι η πιο οικονομική επιλογή.";
  return { score, parts, potentialSavings: savings, headline, actions };
}

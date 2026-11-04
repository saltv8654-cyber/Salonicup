import type { Bill, EnergyCategory, Tariff, TariffColor } from "./types";
import { gasYearFraction, parseDate } from "./season";
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
  /** the validity period has ended: shown with a warning, never recommended */
  expired: boolean;
  /** not confirmed from its source recently: shown as indicative */
  unverified: boolean;
}

/** Prices older than this are shown as "not verified recently". */
export const VERIFY_DAYS = 45;
const athensToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });

export function reliability(t: Tariff, now = Date.now()) {
  const expired = !!t.valid_until && t.valid_until < athensToday();
  const verifiedAt = t.last_verified_at ? Date.parse(t.last_verified_at) : NaN;
  const unverified = t.data_status !== "verified" || !Number.isFinite(verifiedAt) || now - verifiedAt > VERIFY_DAYS * 86_400_000;
  return { expired, unverified };
}

export interface Comparison {
  annualKwh: number;
  currentAnnual: number | null;
  offers: Offer[];
  /** Cheapest offer of each tariff colour, for the "which colour suits you" view */
  byColor: Record<TariffColor, Offer | null>;
  recommendation: { color: TariffColor; text: string; reasons: string[] } | null;
  /** how the numbers were worked out, shown under the comparison */
  assumptions: string[];
  /** Cheapest / best value / most stable, from verified prices only */
  picks: Pick[];
  /** programmes left out because their price is not verified or has expired */
  excluded: number;
  /** share of consumption at night, when the bill shows it */
  nightShare: number | null;
}

export type PickKind = "cheapest" | "value" | "stable";
export interface Pick {
  kind: PickKind;
  offer: Offer;
  /** € per year vs today's programme; null when today's cost is unknown */
  savings: number | null;
  why: string[];
  conditions: string[];
  risks: string[];
}

/** Programmes that may be compared: price confirmed by its source recently and still valid (electricity). Gas is still indicative. */
export function comparable(t: Tariff, category: EnergyCategory = "electricity") {
  const r = reliability(t);
  return category === "electricity" ? !r.expired && !r.unverified : !r.expired;
}

function supplyCost(kwh: number, fixedMonthly: number, pricePerKwh: number) {
  return (fixedMonthly * 12 + kwh * pricePerKwh) * (1 + VAT);
}

/** Yearly supply cost with the night share billed at the night price on day/night programmes. */
function tariffCost(kwh: number, nightShare: number, t: Tariff, price: number) {
  if (t.day_night && t.price_per_kwh_night_eur !== undefined && nightShare > 0) {
    return (t.fixed_monthly_eur * 12 + kwh * (1 - nightShare) * price + kwh * nightShare * t.price_per_kwh_night_eur) * (1 + VAT);
  }
  return supplyCost(kwh, t.fixed_monthly_eur, price);
}

export function nightShareOf(bill: Bill): number | null {
  if (bill.kwh_night === null || bill.kwh_night === undefined || !bill.kwh_total) return null;
  const share = bill.kwh_night / bill.kwh_total;
  return share >= 0 && share <= 1 ? share : null;
}

/** Billed period scaled to a year: linear for electricity, by heating season for gas. */
export function annualKwh(bill: Bill, category: EnergyCategory = "electricity"): number {
  const days = bill.billing_days && bill.billing_days > 0 ? bill.billing_days : 30;
  if (category === "gas") {
    const start = parseDate(bill.period_start);
    const end = parseDate(bill.period_end);
    const f = start && end && end >= start ? gasYearFraction(start, end) : null;
    if (f && f > 0.01) return Math.round((bill.kwh_total ?? 0) / f);
  }
  return Math.round(((bill.kwh_total ?? 0) / days) * 365);
}

/**
 * What the customer pays for supply today, per year incl. VAT. Prefer the supplier total actually
 * charged on the bill (fixed fee + energy − discounts), scaled to a year; it needs no assumptions
 * about how the provider pro-rates the fixed fee.
 */
function currentAnnualCost(bill: Bill, kwh: number, category: EnergyCategory): number | null {
  const days = bill.billing_days && bill.billing_days > 0 ? bill.billing_days : null;
  // Gas: the period's energy share isn't a fixed fraction of the year, so split fee and energy before scaling.
  if (category === "gas" && bill.supplier_total && days && bill.kwh_total) {
    const periodFee = bill.fixed_monthly_fee ?? 0;
    const rate = Math.max(0, bill.supplier_total - periodFee) / bill.kwh_total;
    return supplyCost(kwh, periodFee * (30.44 / days), rate);
  }
  if (bill.supplier_total && days) return bill.supplier_total * (365 / days) * (1 + VAT);
  if (bill.fixed_monthly_fee === null) return null;
  const rate =
    bill.net_energy_charge && bill.kwh_total ? bill.net_energy_charge / bill.kwh_total : bill.kwh_rate;
  return rate !== null ? supplyCost(kwh, bill.fixed_monthly_fee, rate) : null;
}

export function compare(bill: Bill, tariffs: Tariff[], category: EnergyCategory = "electricity"): Comparison {
  const kwh = annualKwh(bill, category);
  const currentAnnual = currentAnnualCost(bill, kwh, category);
  const nightShare = category === "electricity" ? nightShareOf(bill) : null;
  // Never compare with outdated or unverified prices.
  const usable = tariffs.filter((t) => comparable(t, category));

  const offers: Offer[] = usable
    .map((t) => {
      const annual = tariffCost(kwh, nightShare ?? 0, t, t.price_per_kwh_eur);
      const annualWithDiscount =
        t.price_per_kwh_with_discount_eur !== undefined ? tariffCost(kwh, nightShare ?? 0, t, t.price_per_kwh_with_discount_eur) : null;
      const best = annualWithDiscount ?? annual;
      return { tariff: t, annual, annualWithDiscount, savings: currentAnnual !== null ? currentAnnual - best : null, ...reliability(t) };
    })
    .sort((a, b) => (a.annualWithDiscount ?? a.annual) - (b.annualWithDiscount ?? b.annual));

  const byColor = Object.fromEntries(
    (["blue", "green", "yellow", "orange"] as TariffColor[]).map((c) => [c, offers.find((o) => o.tariff.color === c && !o.expired) ?? null]),
  ) as Record<TariffColor, Offer | null>;

  return {
    annualKwh: kwh, currentAnnual, offers, byColor,
    recommendation: recommend(offers.filter((o) => !o.expired), currentAnnual, kwh),
    assumptions: assumptions(bill, kwh, currentAnnual, offers, category, nightShare, tariffs.length - usable.length),
    picks: picks(offers, currentAnnual),
    excluded: tariffs.length - usable.length,
    nightShare,
  };
}

const costOf = (o: Offer) => o.annualWithDiscount ?? o.annual;
const STABILITY: Record<TariffColor, number> = { blue: 1, green: 0.5, yellow: 0.2, orange: 0 };
const monthsUntil = (d?: string) => (d ? (Date.parse(`${d}T00:00:00Z`) - Date.now()) / (30.44 * 86_400_000) : null);

/** Points for "best value": cost (60), price stability (20), contract terms (20). Every point is explainable. */
export function valueScore(o: Offer, cheapest: number) {
  const t = o.tariff;
  const extra = (costOf(o) - cheapest) / cheapest; // 0 = cheapest
  const cost = Math.max(0, 60 - extra * 300); // −3 points per 1% above the cheapest
  const stability = 20 * STABILITY[t.color];
  let contract = 20;
  if (t.min_duration_months) contract -= t.min_duration_months > 12 ? 8 : 4;
  if (t.early_termination_fee) contract -= 6;
  const promoLeft = monthsUntil(t.valid_until);
  if (t.promo_discount && promoLeft !== null && promoLeft < 12) contract -= 4;
  if (t.price_per_kwh_with_discount_eur !== undefined) contract -= 2; // depends on a condition being met
  return Math.round(cost + stability + Math.max(0, contract));
}

function conditionsOf(t: Tariff): string[] {
  const c: string[] = [];
  if (t.discount_condition && t.price_per_kwh_with_discount_eur !== undefined) c.push(`Η χαμηλότερη τιμή ισχύει ${t.discount_condition}.`);
  else if (t.discount_condition) c.push(t.discount_condition);
  if (t.min_duration_months) c.push(`Διάρκεια σύμβασης ${t.min_duration_months} μήνες.`);
  if (t.early_termination_fee) c.push(`Πρόωρη λήξη: ${t.early_termination_fee}.`);
  if (t.promo_discount) c.push(`Προσφορά: ${t.promo_discount}${t.valid_until ? ` (ισχύει έως ${t.valid_until.split("-").reverse().join("/")})` : ""}.`);
  if (t.conditions) c.push(t.conditions);
  if (t.day_night) c.push("Έχει χωριστή νυχτερινή τιμή.");
  return c;
}

function risksOf(t: Tariff): string[] {
  const r: string[] = [];
  if (t.color === "green") r.push("Κυμαινόμενη τιμή: ανακοινώνεται κάθε μήνα και μπορεί να ανέβει. Το μελλοντικό κόστος είναι εκτίμηση, όχι εγγύηση.");
  if (t.color === "yellow") r.push("Τιμή που ακολουθεί τη χονδρεμπορική: τη μαθαίνεις μετά την κατανάλωση. Το μελλοντικό κόστος είναι εκτίμηση, όχι εγγύηση.");
  if (t.color === "blue") r.push("Σταθερή τιμή: αν πέσουν οι τιμές της αγοράς, δεν το κερδίζεις.");
  if (t.min_duration_months || t.early_termination_fee) r.push("Δέσμευση: αν φύγεις νωρίτερα μπορεί να υπάρξει χρέωση.");
  if (t.price_per_kwh_with_discount_eur !== undefined) r.push("Αν δεν τηρήσεις τον όρο της έκπτωσης, πληρώνεις την κανονική τιμή.");
  const left = monthsUntil(t.valid_until);
  if (t.promo_discount && left !== null && left < 12) r.push("Η προσφορά λήγει σε λιγότερο από έναν χρόνο· μετά το κόστος αλλάζει.");
  return r;
}

function picks(offers: Offer[], currentAnnual: number | null): Pick[] {
  const pool = offers.filter((o) => !o.expired && o.tariff.color !== "orange"); // orange needs a smart meter
  if (pool.length === 0) return [];
  const cheapestCost = costOf(pool[0]);
  const save = (o: Offer) => (currentAnnual !== null ? currentAnnual - costOf(o) : null);
  const out: Pick[] = [];

  const cheapest = pool[0];
  out.push({
    kind: "cheapest", offer: cheapest, savings: save(cheapest),
    why: [`Το χαμηλότερο εκτιμώμενο ετήσιο κόστος για την κατανάλωσή σου: ~${fmt(cheapestCost)}/έτος (~${fmt(cheapestCost / 12)}/μήνα).`],
    conditions: conditionsOf(cheapest.tariff), risks: risksOf(cheapest.tariff),
  });

  const value = pool.map((o) => ({ o, score: valueScore(o, cheapestCost) })).sort((a, b) => b.score - a.score)[0];
  out.push({
    kind: "value", offer: value.o, savings: save(value.o),
    why: [
      value.o === cheapest
        ? "Είναι το φθηνότερο και έχει και τους καλύτερους όρους συνολικά."
        : `Κοστίζει ${fmt(costOf(value.o) - cheapestCost)}/έτος παραπάνω από το φθηνότερο, αλλά έχει καλύτερη ισορροπία τιμής, σταθερότητας και όρων.`,
      `Βαθμολογία αξίας ${value.score}/100: κόστος έως 60, σταθερότητα τιμής έως 20, όροι σύμβασης έως 20.`,
    ],
    conditions: conditionsOf(value.o.tariff), risks: risksOf(value.o.tariff),
  });

  const stable = pool.find((o) => o.tariff.color === "blue");
  if (stable) {
    out.push({
      kind: "stable", offer: stable, savings: save(stable),
      why: [
        "Σταθερή τιμή (μπλε τιμολόγιο): ο λογαριασμός σου δεν εξαρτάται από τις τιμές της αγοράς.",
        stable === cheapest ? "Είναι ταυτόχρονα και το φθηνότερο." : `Κοστίζει ${fmt(costOf(stable) - cheapestCost)}/έτος παραπάνω από το φθηνότερο.`,
      ],
      conditions: conditionsOf(stable.tariff), risks: risksOf(stable.tariff),
    });
  }
  return out;
}

function assumptions(bill: Bill, kwh: number, currentAnnual: number | null, offers: Offer[], category: EnergyCategory, nightShare: number | null = null, excluded = 0): string[] {
  const days = bill.billing_days && bill.billing_days > 0 ? bill.billing_days : null;
  const out: string[] = [];
  if (bill.is_estimate && bill.total_due === null && bill.supplier_total === null) out.push("Η κατανάλωση είναι αυτή που έδωσες στον υπολογιστή.");
  else if (category === "gas") out.push(`Ετήσια κατανάλωση ~${kwh.toLocaleString("el-GR")} kWh: η κατανάλωση της περιόδου αναγωγή σε έτος με εποχικό προφίλ θέρμανσης.`);
  else out.push(`Ετήσια κατανάλωση ~${kwh.toLocaleString("el-GR")} kWh: ${bill.kwh_total ?? "—"} kWh σε ${days ?? 30} ημέρες, αναγωγή σε 365 ημέρες.`);
  out.push("Υπολογίζονται μόνο οι χρεώσεις προμήθειας (πάγιο + ενέργεια) με ΦΠΑ 6%. Οι ρυθμιζόμενες χρεώσεις, οι φόροι και το ΕΡΤ είναι ίδια σε όλους τους παρόχους και δεν αλλάζουν τη σύγκριση.");
  out.push("Μηνιαίο κόστος = ετήσιο / 12. Στην πράξη ο λογαριασμός αλλάζει με την εποχή.");
  if (offers.some((o) => o.annualWithDiscount !== null)) out.push("Όπου υπάρχει έκπτωση υπό όρους (π.χ. έγκαιρη πληρωμή), η κατάταξη θεωρεί ότι την παίρνεις.");
  if (currentAnnual !== null) out.push(bill.supplier_total ? "Το σημερινό κόστος βγαίνει από το «σύνολο προμήθειας» του λογαριασμού σου, αναγωγή σε έτος." : "Το σημερινό κόστος βγαίνει από το πάγιο και την τιμή kWh του λογαριασμού σου.");
  out.push("Οι κυμαινόμενες τιμές (πράσινα, κίτρινα) αλλάζουν κάθε μήνα· η σύγκριση χρησιμοποιεί την τελευταία δημοσιευμένη τιμή.");
  if (offers.some((o) => o.expired)) out.push("Προγράμματα με ληγμένη ισχύ φαίνονται με προειδοποίηση και δεν προτείνονται.");
  if (nightShare !== null && nightShare > 0) out.push(`Το ${Math.round(nightShare * 100)}% της κατανάλωσής σου είναι νυχτερινό: στα προγράμματα με νυχτερινή τιμή υπολογίζεται με αυτήν.`);
  if (category === "electricity") {
    out.push(`Συγκρίνονται μόνο προγράμματα με τιμή επιβεβαιωμένη από την επίσημη πηγή τις τελευταίες ${VERIFY_DAYS} ημέρες και σε ισχύ.${excluded ? ` ${excluded} προγράμματα δεν συμπεριλήφθηκαν γιατί η τιμή τους δεν είναι επιβεβαιωμένη ή έχει λήξει.` : ""}`);
    out.push("Η εξοικονόμηση είναι εκτίμηση με βάση την κατανάλωση της περιόδου του λογαριασμού, όχι εγγυημένο ποσό.");
  } else if (offers.some((o) => o.unverified)) {
    out.push(`Τιμές που δεν επιβεβαιώθηκαν από την πηγή τους τις τελευταίες ${VERIFY_DAYS} ημέρες σημειώνονται ως ενδεικτικές.`);
  }
  return out;
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

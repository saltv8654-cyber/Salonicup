import { type Flag, type TariffValues, normKey, today } from "./model";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const pctChange = (a: number, b: number) => (a === 0 ? (b === 0 ? 0 : Infinity) : (b - a) / a);

/**
 * Checks one extracted / edited programme. Errors block approval until the value is fixed;
 * warnings ask the administrator to look twice. `old` is the published version, if any.
 */
export function validateValues(v: TariffValues, old: TariffValues | null): Flag[] {
  const flags: Flag[] = [];
  const add = (code: string, level: Flag["level"], message: string) => flags.push({ code, level, message });

  if (!v.name.trim()) add("missing_name", "error", "Λείπει το όνομα του προγράμματος");
  if (v.price_per_kwh_eur === null) add("missing_price", "error", "Λείπει η τιμή €/kWh");
  if (v.fixed_monthly_eur === null) add("missing_fee", "error", "Λείπει το πάγιο €/μήνα");
  if (v.color === null) add("missing_color", "error", "Δεν βρέθηκε το χρώμα του τιμολογίου");

  const priceOk = (p: number) => Number.isFinite(p) && p >= 0.03 && p <= 0.6;
  if (v.price_per_kwh_eur !== null && !priceOk(v.price_per_kwh_eur)) {
    add("bad_price", "error", `Η τιμή ${v.price_per_kwh_eur} €/kWh είναι εκτός λογικών ορίων (0,03–0,60). Μήπως είναι σε λεπτά ή €/MWh;`);
  }
  if (v.fixed_monthly_eur !== null && (!Number.isFinite(v.fixed_monthly_eur) || v.fixed_monthly_eur < 0 || v.fixed_monthly_eur > 30)) {
    add("bad_fee", "error", `Πάγιο ${v.fixed_monthly_eur} €/μήνα εκτός λογικών ορίων (0–30)`);
  }
  if (v.price_per_kwh_with_discount_eur !== null) {
    if (!priceOk(v.price_per_kwh_with_discount_eur)) add("bad_discount_price", "error", "Η τιμή με έκπτωση είναι εκτός λογικών ορίων");
    else if (v.price_per_kwh_eur !== null && v.price_per_kwh_with_discount_eur > v.price_per_kwh_eur) {
      add("discount_above_price", "error", "Η τιμή με έκπτωση είναι μεγαλύτερη από την κανονική");
    }
  }
  if (v.min_duration_months !== null && (!Number.isInteger(v.min_duration_months) || v.min_duration_months < 0 || v.min_duration_months > 60)) {
    add("bad_duration", "error", "Η διάρκεια σύμβασης πρέπει να είναι ακέραιοι μήνες (0–60)");
  }

  // Day / night
  if (v.day_night && v.price_per_kwh_night_eur === null) add("night_missing", "error", "Πρόγραμμα ημέρας/νύχτας χωρίς νυχτερινή τιμή");
  if (!v.day_night && v.price_per_kwh_night_eur !== null) add("night_without_flag", "warning", "Υπάρχει νυχτερινή τιμή αλλά το πρόγραμμα δεν είναι σημειωμένο ημέρας/νύχτας");
  if (v.price_per_kwh_night_eur !== null) {
    if (!priceOk(v.price_per_kwh_night_eur)) add("bad_night_price", "error", "Η νυχτερινή τιμή είναι εκτός λογικών ορίων");
    else if (v.price_per_kwh_eur !== null && v.price_per_kwh_night_eur >= v.price_per_kwh_eur) {
      add("night_not_cheaper", "warning", "Η νυχτερινή τιμή δεν είναι φθηνότερη από την ημερήσια");
    }
  }

  // Dates
  for (const [k, label] of [["valid_from", "έναρξης"], ["valid_until", "λήξης"]] as const) {
    const d = v[k];
    if (d !== null && !validDate(d)) add(`bad_${k}`, "error", `Μη έγκυρη ημερομηνία ${label}: «${d}» (ΕΕΕΕ-ΜΜ-ΗΗ)`);
  }
  if (v.valid_from && v.valid_until && validDate(v.valid_from) && validDate(v.valid_until) && v.valid_until < v.valid_from) {
    add("dates_reversed", "error", "Η λήξη είναι πριν από την έναρξη");
  }
  if (v.valid_until && validDate(v.valid_until) && v.valid_until < today()) add("expired", "warning", `Η ισχύς έληξε στις ${v.valid_until}`);
  if (v.valid_month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.valid_month)) add("bad_valid_month", "error", "Μήνας τιμής σε μορφή ΕΕΕΕ-ΜΜ");

  if (!v.url) add("no_source", "error", "Λείπει η πηγή (link)");
  else if (!/^https?:\/\//i.test(v.url)) add("bad_source", "error", "Η πηγή πρέπει να είναι link http(s)");

  // Unusual moves compared with what is published today
  if (old) {
    const big = (a: number | null, b: number | null, limit: number) => a !== null && b !== null && Math.abs(pctChange(a, b)) > limit;
    if (big(old.price_per_kwh_eur, v.price_per_kwh_eur, 0.2)) {
      const p = pctChange(old.price_per_kwh_eur!, v.price_per_kwh_eur!);
      add("big_price_change", "warning", `Μεγάλη αλλαγή τιμής: ${p > 0 ? "+" : ""}${Math.round(p * 100)}%`);
    }
    if (big(old.fixed_monthly_eur, v.fixed_monthly_eur, 0.3)) add("big_fee_change", "warning", "Μεγάλη αλλαγή στο πάγιο (>30%)");
    if (old.color && v.color && old.color !== v.color) add("color_changed", "warning", "Άλλαξε το χρώμα του τιμολογίου");
  }
  return flags;
}

/** Duplicate programmes inside one extraction. */
export function duplicateNames(list: TariffValues[]): Set<string> {
  const seen = new Map<string, number>();
  for (const v of list) {
    const k = `${normKey(v.provider)}|${normKey(v.name)}|${v.segment}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

/** Is the price visible in the page text? Accepts 0,1350 / 0.135 / 13,5 λεπτά / 135 €/MWh spellings. */
export function priceAppearsIn(text: string, price: number): boolean {
  const flat = text.replace(/\s+/g, " ");
  const variants = new Set<string>();
  const add = (n: number, maxDec: number) => {
    for (let d = 0; d <= maxDec; d++) {
      const s = n.toFixed(d);
      if (Math.abs(Number(s) - n) < 1e-9) {
        variants.add(s);
        variants.add(s.replace(".", ","));
      }
    }
  };
  add(price, 6);
  add(Math.round(price * 100 * 10000) / 10000, 4); // λεπτά
  add(Math.round(price * 1000 * 100) / 100, 2); // €/MWh
  for (const s of variants) {
    if (!/[.,]/.test(s) && s.length < 3) continue; // "13" alone is too common to mean anything
    const esc = s.replace(/[.,]/g, "[.,]");
    if (new RegExp(`(^|[^0-9])${esc}0*([^0-9]|$)`).test(flat)) return true;
  }
  return false;
}

export const hasErrors = (flags: Flag[]) => flags.some((f) => f.level === "error");

import { normaliseProfile, profileToBill, type EnergyProfile } from "./account";
import { compare, restricted } from "./compare";
import type { Lead } from "./db";
import type { Bill, EnergyCategory, Tariff } from "./types";

/**
 * CRM helpers: lead score (who to call first), stalled deals, next best offer and ready-made messages.
 * Everything is computed from data the customer gave us (form, bill, account) and their visits to the
 * site only when they accepted statistics cookies.
 */

export type Temperature = "hot" | "warm" | "cold";
export interface LeadScore { score: number; label: Temperature; reasons: string[] }

export interface LeadSignals {
  /** distinct days with visits, from consented statistics */
  visitDays: number;
  lastSeen: string | null;
  lastActivity: string | null;
  profile: EnergyProfile | null;
}

const OPEN = ["new", "contacted", "evaluation", "offer"];
const daysSince = (iso: string | null | undefined) => (iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Infinity);

/** 0–100. Savings 35 · contract timing 15 · bill/account 15 · recency 20 · engagement 15. */
export function scoreLead(l: Lead, s: LeadSignals): LeadScore {
  const reasons: string[] = [];
  let pts = 0;

  const savings = Number(l.savings ?? 0);
  const sv = savings >= 200 ? 35 : savings >= 100 ? 28 : savings >= 50 ? 20 : savings > 0 ? 10 : 0;
  pts += sv;
  if (savings > 0) reasons.push(`Εξοικονόμηση ~${Math.round(savings)} €/έτος`);

  const end = s.profile?.contract_end;
  if (end) {
    const d = Math.ceil((Date.parse(`${end}T00:00:00Z`) - Date.now()) / 86_400_000);
    if (d < 0) { pts += 12; reasons.push("Η σύμβασή του έχει λήξει: αλλάζει χωρίς χρέωση"); }
    else if (d <= 60) { pts += 15; reasons.push(`Η σύμβαση λήγει σε ${d} ημέρες`); }
    else pts += 3;
  }

  const hasBill = !!l.bill && typeof (l.bill as Record<string, unknown>).kwh_total === "number";
  if (hasBill) { pts += 8; reasons.push("Ανέβασε λογαριασμό"); }
  if (l.user_id) { pts += 7; reasons.push("Έχει λογαριασμό στο Billi"); }

  const recent = Math.min(daysSince(l.created_at), daysSince(s.lastSeen));
  pts += recent <= 2 ? 20 : recent <= 7 ? 14 : recent <= 30 ? 7 : 0;
  if (recent <= 7) reasons.push(recent < 1 ? "Ενεργός σήμερα" : `Ενεργός πριν ${Math.round(recent)} ημέρες`);

  pts += Math.min(15, s.visitDays * 5);
  if (s.visitDays >= 2) reasons.push(`Επέστρεψε στο site ${s.visitDays} ημέρες`);

  if (l.status === "offer") reasons.push("Έχει ήδη προσφορά");
  if (!OPEN.includes(l.status)) reasons.push("Κλειστό αίτημα");

  const score = OPEN.includes(l.status) ? Math.min(100, Math.round(pts)) : 0;
  return { score, label: score >= 60 ? "hot" : score >= 35 ? "warm" : "cold", reasons };
}

/** An open deal with no contact for a week. */
export function isStalled(l: Lead, lastActivity: string | null) {
  return OPEN.includes(l.status) && daysSince(lastActivity ?? l.updated_at ?? l.created_at) > 7;
}

/** The customer's consumption as a bill: the account profile if any, else what the form carried. */
function leadBill(l: Lead, profile: EnergyProfile | null): Bill | null {
  if (profile) return profileToBill(profile);
  const b = (l.bill ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const kwh = num(b.kwh_total);
  const days = num(b.billing_days);
  if (kwh && days) {
    return {
      provider: l.current_provider, program_name: l.current_program, tariff_color: (b.tariff_color as Bill["tariff_color"]) ?? null,
      period_start: null, period_end: null, billing_days: days, kwh_total: kwh, kwh_day: null, kwh_night: null,
      kwh_rate: num(b.kwh_rate), kwh_rate_night: null, fixed_monthly_fee: num(b.fixed_monthly_fee), energy_charge_gross: null,
      consistency_discount: null, net_energy_charge: null, supplier_total: num(b.supplier_total), regulated_total: null,
      municipal_total: null, efk_total: null, vat_amount: null, total_due: num(b.total_due), is_estimate: false,
    };
  }
  if (l.annual_kwh) {
    const month = 365 / 12;
    return {
      provider: l.current_provider, program_name: l.current_program, tariff_color: null, period_start: null, period_end: null,
      billing_days: month, kwh_total: l.annual_kwh / 12, kwh_day: null, kwh_night: null, kwh_rate: null, kwh_rate_night: null,
      fixed_monthly_fee: null, energy_charge_gross: null, consistency_discount: null, net_energy_charge: null,
      supplier_total: l.current_annual ? Number(l.current_annual) / 1.06 / 12 : null, regulated_total: null, municipal_total: null,
      efk_total: null, vat_amount: null, total_due: null, is_estimate: true,
    };
  }
  return null;
}

export interface NextOffer {
  tariff: Tariff;
  annual: number;
  monthly: number;
  savings: number | null;
  why: string;
}

/** Cheapest verified programme for this customer (household electricity or gas). */
export function nextBestOffer(l: Lead, tariffs: Tariff[], category: EnergyCategory, profile: EnergyProfile | null): NextOffer | null {
  const bill = leadBill(l, category === "electricity" ? profile : null);
  if (!bill) return null;
  const c = compare(bill, tariffs, category);
  const pool = c.offers.filter((o) => !o.expired && o.tariff.color !== "orange" && !restricted(o.tariff));
  const pick = c.picks.find((p) => p.kind === "value")?.offer ?? pool[0];
  if (!pick) return null;
  const annual = pick.annualWithDiscount ?? pick.annual;
  return {
    tariff: pick.tariff, annual, monthly: annual / 12, savings: c.currentAnnual !== null ? c.currentAnnual - annual : null,
    why: c.picks.find((p) => p.kind === "value")?.why[0] ?? "Το φθηνότερο επιβεβαιωμένο πρόγραμμα για την κατανάλωσή του.",
  };
}

const eur = (n: number) => `${Math.round(n).toLocaleString("el-GR")} €`;

/** Greek mobile in international form for Viber / WhatsApp links. */
export function intlPhone(phone: string) {
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return `+${d.slice(2)}`;
  return d.length === 10 ? `+30${d}` : d;
}

export function messages(l: Lead, offer: NextOffer | null, adminName: string) {
  // No first name: Greek needs the vocative ("Κώστα", not "Κώστας"), which can't be derived reliably.
  const hi = `Γεια σας! Είμαι ${adminName} από το Billi.`;
  const body = offer
    ? `${hi} Με βάση την κατανάλωσή σας, το ${offer.tariff.provider} ${offer.tariff.name} βγαίνει ~${eur(offer.monthly)}/μήνα` +
      `${offer.savings && offer.savings > 0 ? `, δηλαδή ~${eur(offer.savings)} λιγότερα τον χρόνο από ό,τι πληρώνετε σήμερα (εκτίμηση)` : ""}. ` +
      `Θέλετε να σας εξηγήσω τους όρους και να κάνουμε την αλλαγή; Γίνεται χωρίς διακοπή ρεύματος.`
    : `${hi} Είδα το αίτημά σας. Πότε σας βολεύει να μιλήσουμε για να δούμε τι σας συμφέρει;`;
  const phone = intlPhone(l.phone);
  return {
    text: body,
    viber: `viber://chat?number=${encodeURIComponent(phone)}&draft=${encodeURIComponent(body)}`,
    whatsapp: `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(body)}`,
    email: l.email ? `mailto:${l.email}?subject=${encodeURIComponent("Η πρόταση του Billi για εσάς")}&body=${encodeURIComponent(body)}` : null,
  };
}

export { normaliseProfile };

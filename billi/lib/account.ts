import { z } from "zod";
import { breakdown } from "./breakdown";
import { compare, type Comparison } from "./compare";
import { db } from "./db";
import { normKey } from "./energy/model";
import { mailConfigured } from "./mailer";
import { parseDate } from "./season";
import { billiScore } from "./score";
import { loadTariffs } from "./tariffs";
import type { Bill, Tariff, TariffColor } from "./types";

export interface EnergyProfile {
  id: string; user_id: string; category: string; created_at: string; updated_at: string;
  provider: string | null; provider_id: string | null; tariff_id: string | null; program_name: string | null; color: TariffColor | null;
  monthly_kwh: number | null; day_kwh: number | null; night_kwh: number | null; price_per_kwh: number | null; price_per_kwh_night: number | null;
  fixed_monthly_fee: number | null; contract_start: string | null; contract_end: string | null; early_termination_fee: string | null;
}
export interface UserSettings {
  user_id: string; display_name: string | null; locale: "el" | "en"; inapp_alerts: boolean; email_alerts: boolean;
  email_verified_at: string | null; min_savings_eur: number; contract_reminder_days: number; alerts_checked_at: string | null;
}
export interface UserBill {
  id: string; created_at: string; provider: string | null; program_name: string | null; color: string | null;
  period_start: string | null; period_end: string | null; billing_days: number | null; kwh_total: number | null; kwh_day: number | null;
  kwh_night: number | null; supply_total: number | null; regulated_total: number | null; taxes_total: number | null; total_due: number | null;
}
export interface UserAlert { id: string; created_at: string; kind: string; title: string; body: string; data: Record<string, unknown>; read_at: string | null }

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const DAYS_PER_MONTH = 365 / 12;

export function normaliseProfile(r: Record<string, unknown>): EnergyProfile {
  const p = r as unknown as EnergyProfile;
  return {
    ...p,
    monthly_kwh: n(p.monthly_kwh), day_kwh: n(p.day_kwh), night_kwh: n(p.night_kwh), price_per_kwh: n(p.price_per_kwh),
    price_per_kwh_night: n(p.price_per_kwh_night), fixed_monthly_fee: n(p.fixed_monthly_fee),
  };
}

/** A month of the saved profile, in the shape the comparison engine reads from a bill. */
export function profileToBill(p: EnergyProfile): Bill | null {
  const kwh = p.monthly_kwh ?? (p.day_kwh !== null || p.night_kwh !== null ? (p.day_kwh ?? 0) + (p.night_kwh ?? 0) : null);
  if (!kwh || kwh <= 0) return null;
  const night = p.night_kwh !== null && p.night_kwh <= kwh ? p.night_kwh : null;
  const energy = p.price_per_kwh !== null
    ? (kwh - (night ?? 0)) * p.price_per_kwh + (night ?? 0) * (p.price_per_kwh_night ?? p.price_per_kwh)
    : null;
  return {
    provider: p.provider, program_name: p.program_name, tariff_color: p.color, period_start: null, period_end: null,
    billing_days: DAYS_PER_MONTH, kwh_total: kwh, kwh_day: night !== null ? kwh - night : kwh, kwh_night: night,
    kwh_rate: p.price_per_kwh, kwh_rate_night: p.price_per_kwh_night, fixed_monthly_fee: p.fixed_monthly_fee,
    energy_charge_gross: energy, consistency_discount: null, net_energy_charge: energy,
    supplier_total: energy !== null && p.fixed_monthly_fee !== null ? energy + p.fixed_monthly_fee : null,
    regulated_total: null, municipal_total: null, efk_total: null, vat_amount: null, total_due: null, is_estimate: false,
  };
}

/** Find the published programme a bill or profile refers to. */
export function matchTariff(tariffs: Tariff[], provider: string | null, program: string | null): Tariff | null {
  if (!provider || !program) return null;
  const pk = normKey(provider);
  const nk = normKey(program);
  return tariffs.find((t) => normKey(t.provider) === pk && normKey(t.name) === nk)
    ?? tariffs.find((t) => normKey(t.provider) === pk && (normKey(t.name).includes(nk) || nk.includes(normKey(t.name))))
    ?? null;
}

const iso = (d: string | null) => {
  const p = parseDate(d);
  return p ? p.toISOString().slice(0, 10) : null;
};

/** What we keep of an analysed bill: the figures, never the file or personal identifiers. */
export function billToRow(bill: Bill) {
  const b = breakdown(bill);
  const group = (k: string) => b?.groups.find((g) => g.key === k)?.amount ?? null;
  const keep: (keyof Bill)[] = [
    "kwh_rate", "kwh_rate_night", "fixed_monthly_fee", "energy_charge_gross", "consistency_discount", "promo_discount", "net_energy_charge",
    "network_charges", "system_charges", "pso_charges", "etmear", "other_regulated", "efk_total", "special_levy", "vat_amount",
    "municipal_total", "ert_fee", "is_estimate",
  ];
  return {
    provider: bill.provider, program_name: bill.program_name, color: bill.tariff_color,
    period_start: iso(bill.period_start), period_end: iso(bill.period_end),
    billing_days: bill.billing_days ? Math.round(bill.billing_days) : null,
    kwh_total: bill.kwh_total, kwh_day: bill.kwh_day, kwh_night: bill.kwh_night,
    supply_total: group("supply"), regulated_total: group("regulated"), taxes_total: group("taxes"), total_due: bill.total_due,
    data: Object.fromEntries(keep.map((k) => [k, bill[k] ?? null])),
  };
}

/** Profile fields a freshly analysed bill tells us. */
export function billToProfile(bill: Bill, tariff: Tariff | null) {
  const days = bill.billing_days && bill.billing_days > 0 ? bill.billing_days : null;
  const perMonth = (v: number | null) => (v !== null && days ? Math.round((v / days) * DAYS_PER_MONTH * 100) / 100 : v);
  const price = bill.net_energy_charge !== null && bill.kwh_total ? bill.net_energy_charge / bill.kwh_total : bill.kwh_rate;
  return {
    provider: bill.provider, program_name: bill.program_name, color: bill.tariff_color,
    tariff_id: tariff?.id ?? null,
    monthly_kwh: perMonth(bill.kwh_total), day_kwh: perMonth(bill.kwh_night !== null ? bill.kwh_day : null), night_kwh: perMonth(bill.kwh_night),
    price_per_kwh: price !== null ? Math.round(price * 100000) / 100000 : null, price_per_kwh_night: bill.kwh_rate_night,
    fixed_monthly_fee: bill.fixed_monthly_fee !== null && days && days > 45 ? Math.round(((bill.fixed_monthly_fee * DAYS_PER_MONTH) / days) * 100) / 100 : bill.fixed_monthly_fee,
  };
}

const money = z.number().finite().min(0).max(100_000).nullable();
export const ProfileInput = z.object({
  provider: z.string().trim().max(100).nullable(),
  program_name: z.string().trim().max(200).nullable(),
  color: z.enum(["blue", "green", "yellow", "orange"]).nullable(),
  monthly_kwh: money, day_kwh: money, night_kwh: money,
  price_per_kwh: z.number().finite().min(0).max(2).nullable(),
  price_per_kwh_night: z.number().finite().min(0).max(2).nullable(),
  fixed_monthly_fee: z.number().finite().min(0).max(200).nullable(),
  contract_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  contract_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  early_termination_fee: z.string().trim().max(300).nullable(),
}).refine((p) => !p.contract_start || !p.contract_end || p.contract_end >= p.contract_start, { message: "Η λήξη της σύμβασης είναι πριν από την έναρξη" });

export const SettingsInput = z.object({
  display_name: z.string().trim().max(60).nullable().optional(),
  inapp_alerts: z.boolean().optional(),
  email_alerts: z.boolean().optional(),
  min_savings_eur: z.number().min(0).max(1000).optional(),
  contract_reminder_days: z.number().int().min(1).max(180).optional(),
  locale: z.enum(["el", "en"]).optional(),
});

export async function loadProfile(userId: string): Promise<EnergyProfile | null> {
  const { data, error } = await db().from("energy_profiles").select("*").eq("user_id", userId).eq("category", "electricity").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normaliseProfile(data) : null;
}

export async function loadSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await db().from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { ...(data as UserSettings), min_savings_eur: Number((data as UserSettings).min_savings_eur) };
  const { data: created, error: e2 } = await db().from("user_profiles").upsert({ user_id: userId }, { onConflict: "user_id" }).select().single();
  if (e2) throw new Error(e2.message);
  return { ...(created as UserSettings), min_savings_eur: Number((created as UserSettings).min_savings_eur) };
}

export async function saveProfile(userId: string, patch: Record<string, unknown>): Promise<EnergyProfile> {
  const { data, error } = await db()
    .from("energy_profiles")
    .upsert({ user_id: userId, category: "electricity", ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,category" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normaliseProfile(data);
}

export interface Analysis {
  comparison: Comparison | null;
  currentTariff: Tariff | null;
  estimates: { monthly: number | null; annual: number | null; perKwh: number | null; annualKwh: number | null };
}

/** Compare the saved profile with the latest approved tariffs. */
export async function analyseProfile(p: EnergyProfile | null, tariffs?: Tariff[]): Promise<Analysis> {
  const list = tariffs ?? (await loadTariffs("electricity")).tariffs;
  const bill = p ? profileToBill(p) : null;
  if (!p || !bill) return { comparison: null, currentTariff: null, estimates: { monthly: null, annual: null, perKwh: null, annualKwh: null } };
  const comparison = compare(bill, list, "electricity");
  const annual = comparison.currentAnnual;
  return {
    comparison,
    currentTariff: (p.tariff_id ? list.find((t) => t.id === p.tariff_id) : null) ?? matchTariff(list, p.provider, p.program_name),
    estimates: {
      annual, monthly: annual !== null ? annual / 12 : null,
      perKwh: annual !== null && comparison.annualKwh ? annual / comparison.annualKwh : null,
      annualKwh: comparison.annualKwh,
    },
  };
}

function trends(bills: UserBill[]) {
  const rows = bills
    .filter((b) => b.period_end && b.kwh_total !== null)
    .sort((a, b) => a.period_end!.localeCompare(b.period_end!))
    .map((b) => {
      const days = b.billing_days && b.billing_days > 0 ? b.billing_days : null;
      return {
        id: b.id, end: b.period_end!, label: b.period_end!.slice(0, 7),
        kwh: Number(b.kwh_total), total: b.total_due !== null ? Number(b.total_due) : null,
        kwhPerMonth: days ? (Number(b.kwh_total) / days) * DAYS_PER_MONTH : null,
        costPerMonth: days && b.supply_total !== null && b.regulated_total !== null && b.taxes_total !== null
          ? ((Number(b.supply_total) + Number(b.regulated_total) + Number(b.taxes_total)) / days) * DAYS_PER_MONTH : null,
      };
    });
  const years = new Map<string, { year: string; kwh: number; total: number; bills: number }>();
  for (const r of rows) {
    const y = r.end.slice(0, 4);
    const cur = years.get(y) ?? { year: y, kwh: 0, total: 0, bills: 0 };
    cur.kwh += r.kwh;
    cur.total += r.total ?? 0;
    cur.bills++;
    years.set(y, cur);
  }
  return { periods: rows, years: [...years.values()] };
}

/** Everything the personal dashboard shows. */
export async function overview(userId: string, email: string | null) {
  const [settings, profile, billsRes, alertsRes] = await Promise.all([
    loadSettings(userId),
    loadProfile(userId),
    db().from("user_bills").select("*").eq("user_id", userId).order("period_end", { ascending: false }).limit(60),
    db().from("user_alerts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (billsRes.error) throw new Error(billsRes.error.message);
  if (alertsRes.error) throw new Error(alertsRes.error.message);
  const bills = billsRes.data as UserBill[];
  const a = await analyseProfile(profile);
  const score = a.comparison && profile ? billiScore(a.comparison, profileToBill(profile)!, { contract_end: profile.contract_end, early_termination_fee: profile.early_termination_fee }) : null;
  const daysLeft = profile?.contract_end ? Math.ceil((Date.parse(`${profile.contract_end}T00:00:00Z`) - Date.now()) / 86_400_000) : null;
  const cheapest = a.comparison?.picks.find((p) => p.kind === "cheapest") ?? null;
  const t = trends(bills);
  const withTotals = t.periods.filter((r) => r.costPerMonth !== null);

  return {
    email, settings, profile, bills, alerts: alertsRes.data as UserAlert[],
    unread: (alertsRes.data as UserAlert[]).filter((x) => !x.read_at).length,
    estimates: { ...a.estimates, avgBillMonthly: withTotals.length ? withTotals.reduce((s, r) => s + r.costPerMonth!, 0) / withTotals.length : null },
    currentTariff: a.currentTariff,
    savings: cheapest ? { annual: cheapest.savings, tariff: cheapest.offer.tariff, cost: cheapest.offer.annualWithDiscount ?? cheapest.offer.annual } : null,
    picks: a.comparison?.picks ?? [],
    excluded: a.comparison?.excluded ?? 0,
    assumptions: a.comparison?.assumptions ?? [],
    score,
    contract: profile ? { start: profile.contract_start, end: profile.contract_end, daysLeft, early: profile.early_termination_fee } : null,
    trends: t,
    mail: mailConfigured(),
  };
}

import { db } from "./db";

export const FUNNEL = ["page_view", "upload_start", "analysis_ok", "tariff_click", "lead_open", "lead_submit"] as const;

export interface EventRow {
  created_at: string;
  name: string;
  path: string | null;
  session_id: string | null;
  props: Record<string, unknown> | null;
  source: Record<string, string> | null;
}

export interface LeadRef {
  id: string;
  name: string;
  status: string;
  session_id: string | null;
  created_at: string;
}

/** Everything we know about one visitor (one browser) in the selected period. */
export interface SessionSummary {
  sid: string;
  first_at: string;
  last_at: string;
  events: number;
  steps: string[];
  furthest: string;
  source: string;
  campaign: string | null;
  device: string;
  os: string;
  browser: string;
  country: string;
  city: string | null;
  provider: string | null;
  color: string | null;
  recommended_color: string | null;
  annual_kwh: number | null;
  best_savings: number | null;
  tariffs: string[];
  channels: string[];
  errors: string[];
  days: string[];
  lead: { id: string; name: string; status: string } | null;
}

export type FilterType =
  | "step" | "source" | "campaign" | "device" | "os" | "browser" | "country" | "city"
  | "provider" | "color" | "recommended" | "tariff" | "channel" | "hour" | "weekday" | "error" | "date" | "lead";

const TZ = "Europe/Athens";
export const athensDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const athensHour = (iso: string) => Number(new Date(iso).toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false })) % 24;
const athensWeekday = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { timeZone: TZ, weekday: "long" });

function hostOf(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").replace(/^(m|l|lm)\.facebook\.com$/, "facebook.com");
  } catch {
    return "";
  }
}

export function sourceLabel(src: Record<string, string> | null | undefined) {
  const s = src ?? {};
  return s.utm_source || (s.fbclid ? "facebook" : s.gclid ? "google ads" : "") || hostOf(s.referrer) || "Απευθείας";
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function loadPeriod(days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [ev, leads] = await Promise.all([
    db().from("events").select("created_at, name, path, session_id, props, source").gte("created_at", since).order("created_at", { ascending: true }).limit(50_000),
    db().from("leads").select("id, name, status, session_id, created_at").gte("created_at", since).limit(5_000),
  ]);
  if (ev.error) throw new Error(ev.error.message);
  if (leads.error) throw new Error(leads.error.message);
  return { since, events: (ev.data ?? []) as EventRow[], leads: (leads.data ?? []) as LeadRef[] };
}

export function summarise(events: EventRow[], leads: LeadRef[]): Map<string, SessionSummary> {
  const leadBySid = new Map(leads.filter((l) => l.session_id).map((l) => [l.session_id!, l]));
  const out = new Map<string, SessionSummary>();

  for (const e of events) {
    const sid = e.session_id ?? "anon";
    const p = e.props ?? {};
    let s = out.get(sid);
    if (!s) {
      s = {
        sid, first_at: e.created_at, last_at: e.created_at, events: 0, steps: [], furthest: "page_view",
        source: sourceLabel(e.source), campaign: e.source?.utm_campaign ?? null,
        device: str(p.device) ?? "Άγνωστο", os: str(p.os) ?? "Άγνωστο", browser: str(p.browser) ?? "Άγνωστο",
        country: str(p.country) ?? "Άγνωστο", city: str(p.city),
        provider: null, color: null, recommended_color: null, annual_kwh: null, best_savings: null,
        tariffs: [], channels: [], errors: [], days: [], lead: null,
      };
      out.set(sid, s);
    }
    s.events++;
    s.last_at = e.created_at;
    if (!s.steps.includes(e.name)) s.steps.push(e.name);
    const day = athensDate(e.created_at);
    if (!s.days.includes(day)) s.days.push(day);
    // Older events have no device info; fill it in from a later one when available.
    if (s.device === "Άγνωστο" && str(p.device)) Object.assign(s, { device: p.device, os: str(p.os) ?? s.os, browser: str(p.browser) ?? s.browser });
    if (s.country === "Άγνωστο" && str(p.country)) Object.assign(s, { country: p.country, city: str(p.city) });

    if (e.name === "analysis_ok") {
      s.provider = str(p.provider) ?? s.provider;
      s.color = str(p.color) ?? s.color;
      s.recommended_color = str(p.recommended_color) ?? s.recommended_color;
      s.annual_kwh = num(p.annual_kwh) ?? s.annual_kwh;
      s.best_savings = num(p.best_savings) ?? s.best_savings;
    }
    if (e.name === "tariff_click" && str(p.tariff) && !s.tariffs.includes(p.tariff as string)) s.tariffs.push(p.tariff as string);
    if (e.name === "contact_click" && str(p.channel) && !s.channels.includes(p.channel as string)) s.channels.push(p.channel as string);
    if (e.name === "analysis_error" && str(p.message)) s.errors.push(p.message as string);
  }

  for (const s of out.values()) {
    s.furthest = [...FUNNEL].reverse().find((f) => s.steps.includes(f)) ?? s.steps[0] ?? "page_view";
    const l = leadBySid.get(s.sid);
    if (l) s.lead = { id: l.id, name: l.name, status: l.status };
  }
  return out;
}

export function matches(s: SessionSummary, type: FilterType, value: string): boolean {
  switch (type) {
    case "step": return s.steps.includes(value);
    case "source": return s.source === value;
    case "campaign": return (s.campaign ?? "—") === value;
    case "device": return s.device === value;
    case "os": return s.os === value;
    case "browser": return s.browser === value;
    case "country": return s.country === value;
    case "city": return (s.city ?? "Άγνωστο") === value;
    case "provider": return (s.provider ?? "—") === value;
    case "color": return (s.color ?? "—") === value;
    case "recommended": return (s.recommended_color ?? "—") === value;
    case "tariff": return s.tariffs.includes(value);
    case "channel": return s.channels.includes(value);
    case "hour": return String(athensHour(s.first_at)) === value;
    case "weekday": return athensWeekday(s.first_at) === value;
    case "error": return s.errors.includes(value);
    case "date": return s.days.includes(value);
    case "lead": return value === "yes" ? !!s.lead : !s.lead;
  }
}

export interface Row { key: string; label: string; count: number; filter: { type: FilterType; value: string } }

function countBy(sessions: SessionSummary[], type: FilterType, pick: (s: SessionSummary) => string | string[] | null, label?: (k: string) => string): Row[] {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const v = pick(s);
    for (const k of Array.isArray(v) ? v : v === null ? [] : [v]) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([k, count]) => ({ key: k, label: label ? label(k) : k, count, filter: { type, value: k } }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

const COLOR_LABEL: Record<string, string> = { blue: "🔵 Μπλε", green: "🟢 Πράσινο", yellow: "🟡 Κίτρινο", orange: "🟠 Πορτοκαλί", "—": "Δεν αναγνωρίστηκε" };
const CHANNEL_LABEL: Record<string, string> = { phone: "📞 Κλήση", viber: "💜 Viber", whatsapp: "💬 WhatsApp" };
const WEEK = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"];

export function buildStats(map: Map<string, SessionSummary>, leads: LeadRef[], days: number) {
  const sessions = [...map.values()].filter((s) => s.sid !== "anon");
  const analysed = sessions.filter((s) => s.steps.includes("analysis_ok"));
  const savings = analysed.map((s) => s.best_savings).filter((v): v is number => v !== null && v > 0);
  const kwh = analysed.map((s) => s.annual_kwh).filter((v): v is number => v !== null && v > 0);

  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayKeys.push(athensDate(new Date(Date.now() - i * 86_400_000).toISOString()));
  const daily = dayKeys.map((d) => ({
    date: d,
    visitors: sessions.filter((s) => s.days.includes(d)).length,
    analyses: sessions.filter((s) => s.days.includes(d) && s.steps.includes("analysis_ok")).length,
    leads: leads.filter((l) => athensDate(l.created_at) === d).length,
  }));

  const hours = Array.from({ length: 24 }, (_, h) => ({
    key: String(h), label: `${String(h).padStart(2, "0")}:00`,
    count: sessions.filter((s) => athensHour(s.first_at) === h).length,
    filter: { type: "hour" as FilterType, value: String(h) },
  }));
  const weekdays = WEEK.map((w) => ({
    key: w, label: w, count: sessions.filter((s) => athensWeekday(s.first_at) === w).length,
    filter: { type: "weekday" as FilterType, value: w },
  }));

  return {
    days,
    kpis: {
      visitors: sessions.length,
      returning: sessions.filter((s) => s.days.length > 1).length,
      analyses: analysed.length,
      leads: leads.length,
      signed: leads.filter((l) => ["signed", "active"].includes(l.status)).length,
      conversion: sessions.length ? leads.length / sessions.length : 0,
      avgSavings: savings.length ? savings.reduce((a, b) => a + b, 0) / savings.length : null,
      avgKwh: kwh.length ? kwh.reduce((a, b) => a + b, 0) / kwh.length : null,
    },
    daily,
    funnel: FUNNEL.map((name) => ({ name, sessions: sessions.filter((s) => s.steps.includes(name)).length })),
    breakdowns: {
      sources: countBy(sessions, "source", (s) => s.source),
      campaigns: countBy(sessions, "campaign", (s) => s.campaign),
      devices: countBy(sessions, "device", (s) => s.device),
      os: countBy(sessions, "os", (s) => s.os),
      browsers: countBy(sessions, "browser", (s) => s.browser),
      countries: countBy(sessions, "country", (s) => s.country),
      cities: countBy(sessions, "city", (s) => s.city),
      providers: countBy(analysed, "provider", (s) => s.provider ?? "—"),
      colors: countBy(analysed, "color", (s) => s.color ?? "—", (k) => COLOR_LABEL[k] ?? k),
      recommended: countBy(analysed, "recommended", (s) => s.recommended_color ?? "—", (k) => COLOR_LABEL[k] ?? k),
      tariffs: countBy(sessions, "tariff", (s) => s.tariffs),
      channels: countBy(sessions, "channel", (s) => s.channels, (k) => CHANNEL_LABEL[k] ?? k),
      errors: countBy(sessions, "error", (s) => s.errors),
      hours,
      weekdays,
    },
  };
}

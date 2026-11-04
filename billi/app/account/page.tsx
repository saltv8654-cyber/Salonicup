"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnergyProfile, UserAlert, UserBill, UserSettings } from "@/lib/account";
import type { Pick } from "@/lib/compare";
import { translator } from "@/lib/i18n";
import type { BilliScore } from "@/lib/score";
import { COLOR_INFO, type Tariff, type TariffColor } from "@/lib/types";
import { ScoreCard } from "../insights";

/* ───────────── shared ───────────── */

const t = translator("el");
const card = "rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5";
const input = "w-full rounded-xl bg-[#0a1028] px-3 py-2.5 text-sm text-slate-100 ring-1 ring-white/15 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/60";
const btn = "rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50";
const ghost = "rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50";
const eur = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : `${v.toLocaleString("el-GR", { minimumFractionDigits: d, maximumFractionDigits: d })} €`);
const dmy = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const PENDING = "billi_pending_bill";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `Σφάλμα ${res.status}`), { status: res.status });
  return json as T;
}

interface Overview {
  email: string | null;
  settings: UserSettings;
  profile: EnergyProfile | null;
  bills: UserBill[];
  alerts: UserAlert[];
  unread: number;
  estimates: { monthly: number | null; annual: number | null; perKwh: number | null; annualKwh: number | null; avgBillMonthly: number | null };
  currentTariff: Tariff | null;
  savings: { annual: number | null; tariff: Tariff; cost: number } | null;
  picks: Pick[];
  excluded: number;
  assumptions: string[];
  score: BilliScore | null;
  contract: { start: string | null; end: string | null; daysLeft: number | null; early: string | null } | null;
  trends: { periods: { id: string; label: string; kwh: number; total: number | null; kwhPerMonth: number | null; costPerMonth: number | null }[]; years: { year: string; kwh: number; total: number; bills: number }[] };
  mail: boolean;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </label>
  );
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#01030f]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <a href="/" className="text-lg font-extrabold tracking-tight text-white">Bill<span className="text-gradient">i</span></a>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      </div>
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6">{children}</main>
    </>
  );
}

/* ───────────── sign in / sign up ───────────── */

function AuthPanel({ onDone, resetToken }: { onDone: () => void; resetToken: string | null }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(resetToken ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      if (mode === "login") await api("/api/account/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (mode === "signup") await api("/api/account/signup", { method: "POST", body: JSON.stringify({ email, password, name, consent }) });
      if (mode === "forgot") {
        await api("/api/account/password-reset", { method: "POST", body: JSON.stringify({ email }) });
        setMsg("Αν υπάρχει λογαριασμός με αυτό το email, θα λάβεις σύνδεσμο σε λίγα λεπτά.");
        return;
      }
      if (mode === "reset") {
        await api("/api/account/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password }) });
        setMsg("Ο κωδικός άλλαξε. Συνδέσου με τον νέο κωδικό.");
        setMode("login");
        history.replaceState(null, "", "/account");
        return;
      }
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold text-white">{t("account")}</h1>
      <p className="mt-2 text-sm text-slate-400">{t("whyAccount")}</p>
      {(mode === "login" || mode === "signup") && (
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10" role="tablist">
          {(["login", "signup"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => { setMode(m); setError(null); }}
              className={`rounded-lg py-2 text-sm font-semibold ${mode === m ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white" : "text-slate-300"}`}>
              {t(m)}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className={`${card} mt-4 space-y-3`}>
        {mode === "signup" && <Field label={t("name")}><input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} /></Field>}
        {mode !== "reset" && <Field label={t("email")}><input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>}
        {mode !== "forgot" && (
          <Field label={mode === "reset" ? t("newPassword") : t("password")}>
            <input className={input} type="password" required minLength={mode === "login" ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>
        )}
        {mode === "signup" && (
          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-cyan-400" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>{t("consent")} <a href="/privacy" className="text-cyan-300 underline" target="_blank">Πολιτική Απορρήτου</a></span>
          </label>
        )}
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
        {msg && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">✓ {msg}</p>}
        <button className={`${btn} w-full`} disabled={busy}>
          {busy ? "…" : mode === "login" ? t("login") : mode === "signup" ? t("signup") : mode === "forgot" ? t("sendReset") : t("savePassword")}
        </button>
        {mode === "login" && <button type="button" className="w-full text-center text-xs text-slate-400 underline" onClick={() => setMode("forgot")}>{t("forgot")}</button>}
        {(mode === "forgot" || mode === "reset") && <button type="button" className="w-full text-center text-xs text-slate-400 underline" onClick={() => setMode("login")}>← {t("login")}</button>}
      </form>
    </div>
  );
}

/* ───────────── charts (single series bars, hover tooltip, table fallback) ───────────── */

function Bars({ title, rows, unit }: { title: string; rows: { key: string; label: string; value: number }[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: unit === "€" ? 0 : 0 })}${unit === "€" ? " €" : ` ${unit}`}`;
  return (
    <figure className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/10">
      <figcaption className="text-xs font-semibold text-slate-300">{title}</figcaption>
      <div className="relative mt-3 flex h-36 items-end gap-[2px]" role="img" aria-label={title}>
        {rows.map((r, i) => (
          <div key={r.key} className="relative flex h-full max-w-[48px] flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
            <div className="w-full rounded-t-[4px] transition-opacity" style={{ height: `${Math.max(2, (r.value / max) * 100)}%`, background: "#0891b2", opacity: hover !== null && hover !== i ? 0.5 : 1 }} />
          </div>
        ))}
        {hover !== null && (
          <div className="pointer-events-none absolute -top-2 rounded-lg bg-[#0a1028] px-2 py-1 text-[11px] text-slate-100 ring-1 ring-white/20"
            style={{ left: `${Math.min(75, (hover / rows.length) * 100)}%` }}>
            <b>{fmt(rows[hover].value)}</b> · {rows[hover].label}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>{rows[0].label}</span><span>{rows[rows.length - 1].label}</span></div>
      <details className="mt-2 text-[11px] text-slate-400">
        <summary className="cursor-pointer">Πίνακας τιμών</summary>
        <table className="mt-1 w-full"><tbody>{rows.map((r) => <tr key={r.key}><td className="py-0.5">{r.label}</td><td className="py-0.5 text-right tabular-nums text-slate-200">{fmt(r.value)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/* ───────────── dashboard ───────────── */

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-white">{value}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

const ALERT_ICON: Record<string, string> = { cheaper_program: "💶", provider_increase: "📈", provider_better_offer: "🔁", contract_expiring: "⏰", overpaying: "⚠️" };

type ProfileForm = Record<"provider" | "program_name" | "color" | "monthly_kwh" | "day_kwh" | "night_kwh" | "price_per_kwh" | "price_per_kwh_night" | "fixed_monthly_fee" | "contract_start" | "contract_end" | "early_termination_fee", string>;
const toForm = (p: EnergyProfile | null): ProfileForm => {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    provider: s(p?.provider), program_name: s(p?.program_name), color: s(p?.color), monthly_kwh: s(p?.monthly_kwh), day_kwh: s(p?.day_kwh),
    night_kwh: s(p?.night_kwh), price_per_kwh: s(p?.price_per_kwh), price_per_kwh_night: s(p?.price_per_kwh_night), fixed_monthly_fee: s(p?.fixed_monthly_fee),
    contract_start: s(p?.contract_start), contract_end: s(p?.contract_end), early_termination_fee: s(p?.early_termination_fee),
  };
};
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

function ProfileEditor({ profile, onSaved }: { profile: EnergyProfile | null; onSaved: () => void }) {
  const [f, setF] = useState<ProfileForm>(toForm(profile));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setF(toForm(profile)), [profile]);
  const set = (k: keyof ProfileForm, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const body = {
        provider: f.provider || null, program_name: f.program_name || null, color: (f.color || null) as TariffColor | null,
        monthly_kwh: numOrNull(f.monthly_kwh), day_kwh: numOrNull(f.day_kwh), night_kwh: numOrNull(f.night_kwh),
        price_per_kwh: numOrNull(f.price_per_kwh), price_per_kwh_night: numOrNull(f.price_per_kwh_night), fixed_monthly_fee: numOrNull(f.fixed_monthly_fee),
        contract_start: f.contract_start || null, contract_end: f.contract_end || null, early_termination_fee: f.early_termination_fee || null,
      };
      if (Object.values(body).some((v) => typeof v === "number" && !Number.isFinite(v))) throw new Error("Έλεγξε τους αριθμούς (π.χ. 0.15)");
      await api("/api/account/profile", { method: "PUT", body: JSON.stringify({ profile: body }) });
      setMsg(t("saved"));
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("provider")}><input className={input} value={f.provider} onChange={(e) => set("provider", e.target.value)} placeholder="π.χ. ΔΕΗ" /></Field>
        <Field label={t("program")}><input className={input} value={f.program_name} onChange={(e) => set("program_name", e.target.value)} placeholder="π.χ. myHome Online" /></Field>
        <Field label={t("category")}>
          <select className={input} value={f.color} onChange={(e) => set("color", e.target.value)}>
            <option value="">—</option>
            {(Object.keys(COLOR_INFO) as TariffColor[]).map((c) => <option key={c} value={c}>{COLOR_INFO[c].emoji} {COLOR_INFO[c].label}</option>)}
          </select>
        </Field>
        <Field label="Κατανάλωση kWh / μήνα"><input className={input} inputMode="decimal" value={f.monthly_kwh} onChange={(e) => set("monthly_kwh", e.target.value)} placeholder="300" /></Field>
        <Field label="Ημέρα kWh / μήνα" hint="αν έχεις νυχτερινό"><input className={input} inputMode="decimal" value={f.day_kwh} onChange={(e) => set("day_kwh", e.target.value)} /></Field>
        <Field label="Νύχτα kWh / μήνα"><input className={input} inputMode="decimal" value={f.night_kwh} onChange={(e) => set("night_kwh", e.target.value)} /></Field>
        <Field label="Τιμή €/kWh" hint="χωρίς ΦΠΑ, όπως στον λογαριασμό"><input className={input} inputMode="decimal" value={f.price_per_kwh} onChange={(e) => set("price_per_kwh", e.target.value)} placeholder="0.15" /></Field>
        <Field label="Νυχτερινή €/kWh"><input className={input} inputMode="decimal" value={f.price_per_kwh_night} onChange={(e) => set("price_per_kwh_night", e.target.value)} /></Field>
        <Field label="Πάγιο €/μήνα"><input className={input} inputMode="decimal" value={f.fixed_monthly_fee} onChange={(e) => set("fixed_monthly_fee", e.target.value)} placeholder="5" /></Field>
        <Field label="Έναρξη σύμβασης"><input type="date" className={input} value={f.contract_start} onChange={(e) => set("contract_start", e.target.value)} /></Field>
        <Field label="Λήξη σύμβασης"><input type="date" className={input} value={f.contract_end} onChange={(e) => set("contract_end", e.target.value)} /></Field>
        <Field label="Χρέωση πρόωρης λήξης"><input className={input} value={f.early_termination_fee} onChange={(e) => set("early_termination_fee", e.target.value)} placeholder="π.χ. 50 €" /></Field>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {msg && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">✓ {msg}</p>}
      <button className={btn} disabled={busy}>{busy ? "…" : t("saveProfile")}</button>
    </form>
  );
}

function SettingsEditor({ o, onSaved, onDeleted }: { o: Overview; onSaved: () => void; onDeleted: () => void }) {
  const s = o.settings;
  const [min, setMin] = useState(String(s.min_savings_eur));
  const [days, setDays] = useState(String(s.contract_reminder_days));
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: Partial<UserSettings>) => {
    setMsg(null);
    setError(null);
    try {
      await api("/api/account/profile", { method: "PUT", body: JSON.stringify({ settings: patch }) });
      setMsg(t("saved"));
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const verify = async () => {
    setError(null);
    try {
      await api("/api/account/verify-email", { method: "POST", body: "{}" });
      setMsg(`Στείλαμε σύνδεσμο στο ${o.email}.`);
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div className="space-y-3 text-sm text-slate-200">
      <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={s.inapp_alerts} onChange={(e) => save({ inapp_alerts: e.target.checked })} /> {t("inapp")}</label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={s.email_alerts} disabled={!s.email_verified_at} onChange={(e) => save({ email_alerts: e.target.checked })} /> {t("emailAlerts")}
        </label>
        {s.email_verified_at ? <span className="text-xs text-emerald-300">✓ {t("verified")}</span>
          : o.mail ? <button type="button" className={ghost + " !px-3 !py-1.5 text-xs"} onClick={verify}>✉️ {t("verifyEmail")}</button>
          : <span className="text-xs text-slate-500">(η αποστολή email θα ενεργοποιηθεί σύντομα)</span>}
      </div>
      <p className="text-xs text-slate-500">📱 {t("push")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("minSavings")}><input className={input} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} onBlur={() => Number(min) >= 0 && save({ min_savings_eur: Number(min) })} /></Field>
        <Field label={t("reminderDays")}><input className={input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} onBlur={() => Number(days) >= 1 && save({ contract_reminder_days: Math.round(Number(days)) })} /></Field>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {msg && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">✓ {msg}</p>}
      <div className="border-t border-white/10 pt-3">
        <button type="button" className={ghost + " !text-red-200"} onClick={async () => {
          if (!confirm(t("deleteConfirm"))) return;
          await api("/api/account/me", { method: "DELETE" });
          onDeleted();
        }}>🗑 {t("deleteAccount")}</button>
      </div>
    </div>
  );
}

function Dashboard({ o, reload, onLogout }: { o: Overview; reload: () => void; onLogout: () => void }) {
  const p = o.profile;
  const [tab, setTab] = useState<"profile" | "settings" | null>(p ? null : "profile");
  const [checking, setChecking] = useState(false);
  const periods = o.trends.periods;
  const kwhRows = useMemo(() => periods.filter((r) => r.kwhPerMonth !== null).map((r) => ({ key: r.id, label: r.label, value: Math.round(r.kwhPerMonth!) })), [periods]);
  const costRows = useMemo(() => periods.filter((r) => r.costPerMonth !== null).map((r) => ({ key: r.id, label: r.label, value: Math.round(r.costPerMonth!) })), [periods]);
  const cheapest = o.savings;
  const curTariff = o.currentTariff;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Γεια σου{o.settings.display_name ? `, ${o.settings.display_name}` : ""} 👋</h1>
          <p className="text-sm text-slate-400">{o.email}</p>
        </div>
        <div className="flex gap-2">
          <a href="/" className={btn + " !py-2"}>⚡ {t("upload")}</a>
        </div>
      </div>

      {/* Alerts */}
      <section className={card} aria-labelledby="alerts-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="alerts-h" className="text-lg font-semibold text-white">🔔 {t("alerts")}{o.unread ? <span className="ml-2 rounded-full bg-cyan-400/20 px-2 py-0.5 text-xs text-cyan-200">{o.unread} νέες</span> : null}</h2>
          <div className="flex gap-2">
            <button className={ghost + " !px-3 !py-1.5 text-xs"} disabled={checking} onClick={async () => { setChecking(true); try { await api("/api/account/check", { method: "POST", body: "{}" }); reload(); } finally { setChecking(false); } }}>{checking ? "…" : `↻ ${t("checkNow")}`}</button>
            {o.unread > 0 && <button className={ghost + " !px-3 !py-1.5 text-xs"} onClick={async () => { await api("/api/account/alerts", { method: "POST", body: JSON.stringify({ all: true }) }); reload(); }}>{t("markRead")}</button>}
          </div>
        </div>
        {o.alerts.length === 0 ? <p className="mt-2 text-sm text-slate-400">{t("noAlerts")}</p> : (
          <ul className="mt-3 space-y-2">
            {o.alerts.slice(0, 8).map((a) => (
              <li key={a.id} className={`rounded-xl p-3 ring-1 ${a.read_at ? "bg-white/[0.02] ring-white/10" : "bg-cyan-400/[0.06] ring-cyan-300/30"}`}>
                <div className="text-sm font-semibold text-white">{ALERT_ICON[a.kind] ?? "🔔"} {a.title}</div>
                <div className="mt-0.5 text-xs text-slate-300">{a.body}</div>
                <div className="mt-1 text-[11px] text-slate-500">{new Date(a.created_at).toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" })}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!p || o.estimates.annual === null ? (
        <p className={`${card} text-sm text-slate-300`}>💡 {t("fillProfile")}</p>
      ) : (
        <>
          {/* Overview */}
          <section className={card} aria-labelledby="ov-h">
            <h2 id="ov-h" className="text-lg font-semibold text-white">⚡ {t("overview")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label={t("provider")} value={p.provider ?? "—"} hint={p.program_name ?? undefined} />
              <Stat label={t("category")} value={p.color ? `${COLOR_INFO[p.color].emoji} ${COLOR_INFO[p.color].label}` : "—"} hint={curTariff ? "αναγνωρίστηκε στον κατάλογο" : undefined} />
              <Stat label={t("monthlyKwh")} value={p.monthly_kwh !== null ? `${Math.round(p.monthly_kwh)} kWh` : "—"} hint={p.night_kwh ? `νύχτα ${Math.round(p.night_kwh)} kWh` : undefined} />
              <Stat label={t("monthlyCost")} value={eur(o.estimates.monthly)} hint={t("supplyOnly")} />
              <Stat label={t("annualCost")} value={eur(o.estimates.annual)} hint={t("supplyOnly")} />
              <Stat label={t("perKwh")} value={o.estimates.perKwh !== null ? `${o.estimates.perKwh.toFixed(3).replace(".", ",")} €` : "—"} hint={o.estimates.avgBillMonthly !== null ? `${t("avgBill")}: ${eur(o.estimates.avgBillMonthly)}` : undefined} />
            </div>
          </section>

          {o.score && <div className="-mt-6"><ScoreCard s={o.score} /></div>}

          {/* Savings + contract */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className={card} aria-labelledby="sv-h">
              <h2 id="sv-h" className="text-lg font-semibold text-white">💶 {t("savings")}</h2>
              {cheapest ? (
                <div className="mt-3 space-y-2">
                  <Stat label={t("potentialSavings")} value={<span className={cheapest.annual && cheapest.annual > 0 ? "text-emerald-300" : ""}>{cheapest.annual && cheapest.annual > 0 ? `~${eur(cheapest.annual)}` : "0 €"}</span>} hint={t("estimateNote")} />
                  <div className="rounded-xl bg-white/[0.02] p-3 text-sm ring-1 ring-white/10">
                    <div className="text-[11px] text-slate-400">{t("cheapestAlt")}</div>
                    <div className="font-semibold text-white">{cheapest.tariff.provider} · {cheapest.tariff.name}</div>
                    <div className="text-xs text-slate-400">~{eur(cheapest.cost)}/έτος · {t("difference")}: {cheapest.annual !== null ? `${cheapest.annual >= 0 ? "−" : "+"}${eur(Math.abs(cheapest.annual))}` : "—"}</div>
                  </div>
                  <a href="/#upload" className="inline-block text-xs text-cyan-300 underline">Δες τις 3 προτάσεις με νέο λογαριασμό →</a>
                </div>
              ) : <p className="mt-2 text-sm text-slate-400">{t("noVerified")}</p>}
            </section>
            <section className={card} aria-labelledby="ct-h">
              <h2 id="ct-h" className="text-lg font-semibold text-white">📄 {t("contract")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat label={t("contractEnd")} value={dmy(o.contract?.end ?? null)} />
                <Stat label={t("remaining")} value={o.contract?.daysLeft === null || o.contract?.daysLeft === undefined ? "—" : o.contract.daysLeft < 0 ? t("ended") : `${o.contract.daysLeft} ${t("days")}`} />
              </div>
              <p className="mt-2 text-xs text-slate-400">{t("earlyTermination")}: {o.contract?.early ?? "—"}</p>
              {!o.contract?.end && <button className="mt-2 text-xs text-cyan-300 underline" onClick={() => setTab("profile")}>Πρόσθεσε τη λήξη της σύμβασης →</button>}
            </section>
          </div>
        </>
      )}

      {/* History */}
      <section className={card} aria-labelledby="hs-h">
        <h2 id="hs-h" className="text-lg font-semibold text-white">📈 {t("history")}</h2>
        {o.bills.length === 0 ? <p className="mt-2 text-sm text-slate-400">{t("noBills")}</p> : (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Bars title={t("consumption")} rows={kwhRows} unit="kWh" />
              <Bars title={t("spending")} rows={costRows} unit="€" />
            </div>
            {o.trends.years.length > 1 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {o.trends.years.map((y) => <Stat key={y.year} label={`${t("yearly")} ${y.year}`} value={`${Math.round(y.kwh).toLocaleString("el-GR")} kWh`} hint={`${eur(y.total)} σε ${y.bills} λογαριασμούς`} />)}
              </div>
            )}
            <ul className="mt-3 divide-y divide-white/5">
              {o.bills.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-slate-200">{dmy(b.period_start)} – {dmy(b.period_end)} · {b.provider ?? "—"}</span>
                  <span className="flex items-center gap-3 text-slate-400">
                    <span>{b.kwh_total !== null ? `${Math.round(Number(b.kwh_total))} kWh` : "—"}</span>
                    <span className="font-semibold text-white">{eur(b.total_due !== null ? Number(b.total_due) : null, 2)}</span>
                    <button className="text-xs text-slate-500 hover:text-red-300" title="Διαγραφή" onClick={async () => { if (confirm("Διαγραφή αυτού του λογαριασμού από το ιστορικό;")) { await api(`/api/account/bills/${b.id}`, { method: "DELETE" }); reload(); } }}>🗑</button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Profile & settings */}
      <section className={card} id="settings">
        <div className="flex flex-wrap gap-2">
          <button className={(tab === "profile" ? btn : ghost) + " !py-2"} onClick={() => setTab(tab === "profile" ? null : "profile")}>✏️ {t("profile")}</button>
          <button className={(tab === "settings" ? btn : ghost) + " !py-2"} onClick={() => setTab(tab === "settings" ? null : "settings")}>⚙️ {t("settings")}</button>
          <button className={ghost + " !py-2"} onClick={onLogout}>{t("logout")}</button>
        </div>
        {tab === "profile" && <div className="mt-4"><ProfileEditor profile={p} onSaved={reload} /></div>}
        {tab === "settings" && <div className="mt-4"><SettingsEditor o={o} onSaved={reload} onDeleted={onLogout} /></div>}
      </section>

      {o.assumptions.length > 0 && (
        <details className="rounded-xl bg-white/[0.02] p-3 text-xs text-slate-400 ring-1 ring-white/10">
          <summary className="cursor-pointer font-semibold text-slate-300">🧮 Πώς υπολογίστηκε</summary>
          <ul className="mt-2 space-y-1">{o.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ───────────── page ───────────── */

export default function AccountPage() {
  const [state, setState] = useState<"loading" | "out" | "in" | "off">("loading");
  const [o, setO] = useState<Overview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Overview>("/api/account/me");
      // A bill analysed before signing in: save it now.
      let pending: string | null = null;
      try { pending = sessionStorage.getItem(PENDING); } catch { /* storage blocked */ }
      if (pending) {
        try { sessionStorage.removeItem(PENDING); } catch { /* storage blocked */ }
        try {
          await api("/api/account/bills", { method: "POST", body: pending });
          setNotice("Ο λογαριασμός αποθηκεύτηκε στο προφίλ σου.");
          setO(await api<Overview>("/api/account/me"));
          setState("in");
          return;
        } catch { /* fall through and show the dashboard anyway */ }
      }
      setO(data);
      setState("in");
    } catch (e: any) {
      if (e.status === 401) setState("out");
      else if (e.status === 503 || e.message === "missing_migration") setState("off");
      else { setNotice(e.message); setState("out"); }
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("verified") === "1") setNotice("✓ Το email επιβεβαιώθηκε. Θα λαμβάνεις τις ειδοποιήσεις και με email.");
    if (q.get("verified") === "0") setNotice("Ο σύνδεσμος επιβεβαίωσης έληξε. Ζήτησε νέο από τις ρυθμίσεις.");
    if (q.get("reset")) setResetToken(q.get("reset"));
    load();
  }, [load]);

  const logout = async () => {
    await api("/api/account/logout", { method: "POST", body: "{}" }).catch(() => {});
    setO(null);
    setState("out");
  };

  return (
    <Shell right={state === "in" ? <button className={ghost + " !px-3 !py-1.5 text-xs"} onClick={logout}>{t("logout")}</button> : <a href="/" className={ghost + " !px-3 !py-1.5 text-xs"}>← Αρχική</a>}>
      {notice && <p className="mb-4 rounded-xl bg-cyan-400/10 p-3 text-sm text-cyan-100 ring-1 ring-cyan-300/30">{notice}</p>}
      {state === "loading" && <p className="text-sm text-slate-500">Φόρτωση…</p>}
      {state === "off" && <p className={`${card} text-sm text-slate-300`}>Οι λογαριασμοί χρηστών ενεργοποιούνται σύντομα.</p>}
      {state === "out" && <AuthPanel onDone={load} resetToken={resetToken} />}
      {state === "in" && o && <Dashboard o={o} reload={load} onLogout={logout} />}
    </Shell>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lead, LeadActivity, LeadStatus } from "@/lib/db";

const STATUS: Record<LeadStatus, { label: string; cls: string }> = {
  new: { label: "Νέο", cls: "bg-cyan-400/15 text-cyan-200 ring-cyan-300/40" },
  contacted: { label: "Επικοινωνία", cls: "bg-blue-400/15 text-blue-200 ring-blue-300/40" },
  offer: { label: "Προσφορά", cls: "bg-violet-400/15 text-violet-200 ring-violet-300/40" },
  signed: { label: "Υπογραφή", cls: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/40" },
  active: { label: "Ενεργό", cls: "bg-emerald-500/25 text-emerald-100 ring-emerald-300/50" },
  lost: { label: "Χάθηκε", cls: "bg-white/5 text-slate-400 ring-white/15" },
};
const STATUS_ORDER = Object.keys(STATUS) as LeadStatus[];

const ACTIVITY_ICON: Record<LeadActivity["type"], string> = { note: "📝", call: "📞", email: "✉️", status: "🔁", system: "⚙️" };

const EVENT_LABEL: Record<string, string> = {
  page_view: "Επισκέψεις",
  upload_start: "Ανέβασαν λογαριασμό",
  analysis_ok: "Πήραν ανάλυση",
  tariff_click: "Πάτησαν πρόγραμμα",
  lead_open: "Άνοιξαν φόρμα",
  lead_submit: "Έστειλαν φόρμα",
};

const eur = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Number(n).toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" });

const card = "rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10";
const input =
  "w-full rounded-xl bg-[#0a1028] px-3 py-2 text-sm text-slate-100 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/60";
const btn = "rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50";
const btnGhost = "rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-white/10";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (!res.ok) throw new Error(json.error ?? `Σφάλμα ${res.status}`);
  return json as T;
}

function Badge({ status }: { status: LeadStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS[status].cls}`}>{STATUS[status].label}</span>;
}

/* ───────────── login ───────────── */

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <form
        className={`${card} space-y-3`}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
            onDone();
          } catch (err: any) {
            setError(err.message === "unauthorized" ? "Λάθος κωδικός" : err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-lg font-semibold text-white">Billi CRM</h1>
        <input type="password" autoFocus className={input} placeholder="Κωδικός" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button className={`${btn} w-full`} disabled={busy}>{busy ? "…" : "Είσοδος"}</button>
      </form>
    </main>
  );
}

/* ───────────── lead detail ───────────── */

function LeadDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (l: Lead) => void }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [acts, setActs] = useState<LeadActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"note" | "call" | "email">("call");
  const [edit, setEdit] = useState({ signed_provider: "", expected_commission: "", next_follow_up: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ lead: Lead; activities: LeadActivity[] }>(`/api/admin/leads/${id}`);
      setLead(d.lead);
      setActs(d.activities);
      setEdit({
        signed_provider: d.lead.signed_provider ?? "",
        expected_commission: d.lead.expected_commission?.toString() ?? "",
        next_follow_up: d.lead.next_follow_up ?? "",
      });
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const d = await api<{ lead: Lead }>(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setLead(d.lead);
      onChanged(d.lead);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    try {
      await api(`/api/admin/leads/${id}/activities`, { method: "POST", body: JSON.stringify({ type: noteType, body: note }) });
      setNote("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const src = lead?.source ?? {};
  const bill = (lead?.bill ?? null) as Record<string, unknown> | null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{lead?.name ?? "…"}</h2>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {lead && (
          <div className="mt-4 space-y-4">
            <div className={`${card} space-y-1 text-sm`}>
              <div className="flex flex-wrap gap-2">
                <a className={btn} href={`tel:${lead.phone}`}>📞 {lead.phone}</a>
                {lead.email && <a className={btnGhost} href={`mailto:${lead.email}`}>✉️ {lead.email}</a>}
              </div>
              <div className="pt-2 text-slate-400">Καταχωρίστηκε {when(lead.created_at)} · {lead.preferred_time ?? "—"}</div>
              {lead.message && <div className="text-slate-200">💬 {lead.message}</div>}
              <div className="text-xs text-slate-500">Συναίνεση επικοινωνίας ✓{lead.consent_marketing ? " · ενημερωτικά ✓" : ""}</div>
            </div>

            <div className={`${card} grid grid-cols-2 gap-x-4 gap-y-1 text-sm`}>
              <span className="text-slate-500">Θέλει</span><span className="text-white">{lead.tariff_label ?? "Γενική επικοινωνία"}</span>
              <span className="text-slate-500">Τώρα</span><span>{[lead.current_provider, lead.current_program].filter(Boolean).join(" ") || "—"}</span>
              <span className="text-slate-500">Κατανάλωση</span><span>{lead.annual_kwh ? `${lead.annual_kwh.toLocaleString("el-GR")} kWh/έτος` : "—"}</span>
              <span className="text-slate-500">Σήμερα / νέο</span><span>{eur(lead.current_annual)} → {eur(lead.offer_annual)}</span>
              <span className="text-slate-500">Εξοικονόμηση</span><span className="text-emerald-300">{eur(lead.savings)}</span>
              {bill?.total_due != null && <><span className="text-slate-500">Λογαριασμός</span><span>{eur(bill.total_due as number)} · {String(bill.period ?? "")}</span></>}
              <span className="text-slate-500">Πηγή</span>
              <span className="break-all">{src.utm_source ? `${src.utm_source}${src.utm_campaign ? ` / ${src.utm_campaign}` : ""}` : src.referrer ?? "Απευθείας"}</span>
            </div>

            <div className={`${card} space-y-3`}>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Κατάσταση</div>
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    disabled={saving}
                    onClick={() => patch({ status: s })}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${lead.status === s ? STATUS[s].cls : "bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10"}`}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs text-slate-400">Πάροχος σύμβασης
                  <input className={`${input} mt-1`} value={edit.signed_provider} onChange={(e) => setEdit({ ...edit, signed_provider: e.target.value })} />
                </label>
                <label className="text-xs text-slate-400">Προμήθεια (€)
                  <input className={`${input} mt-1`} inputMode="decimal" value={edit.expected_commission} onChange={(e) => setEdit({ ...edit, expected_commission: e.target.value })} />
                </label>
                <label className="text-xs text-slate-400">Επόμενη κλήση
                  <input type="date" className={`${input} mt-1`} value={edit.next_follow_up} onChange={(e) => setEdit({ ...edit, next_follow_up: e.target.value })} />
                </label>
              </div>
              <button
                className={btn}
                disabled={saving}
                onClick={() =>
                  patch({
                    signed_provider: edit.signed_provider.trim() || null,
                    expected_commission: edit.expected_commission ? Number(edit.expected_commission.replace(",", ".")) : null,
                    next_follow_up: edit.next_follow_up || null,
                  })
                }
              >
                Αποθήκευση
              </button>
            </div>

            <div className={`${card} space-y-3`}>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ιστορικό επικοινωνίας</div>
              <div className="flex gap-2">
                <select className={`${input} w-32`} value={noteType} onChange={(e) => setNoteType(e.target.value as typeof noteType)}>
                  <option value="call">📞 Κλήση</option>
                  <option value="note">📝 Σημείωση</option>
                  <option value="email">✉️ Email</option>
                </select>
                <input className={input} placeholder="π.χ. Δεν απάντησε, ξανά αύριο" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
                <button className={btn} onClick={addNote}>＋</button>
              </div>
              <ol className="space-y-2">
                {acts.map((a) => (
                  <li key={a.id} className="flex gap-3 rounded-xl bg-white/[0.02] p-3 text-sm ring-1 ring-white/10">
                    <span>{ACTIVITY_ICON[a.type]}</span>
                    <div className="min-w-0">
                      <div className="whitespace-pre-wrap text-slate-200">{a.body}</div>
                      <div className="text-xs text-slate-500">{when(a.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ───────────── stats ───────────── */

type FilterType = string;
interface Row { key: string; label: string; count: number; filter: { type: FilterType; value: string } }
interface Stats {
  days: number;
  kpis: { visitors: number; returning: number; analyses: number; leads: number; signed: number; conversion: number; avgSavings: number | null; avgKwh: number | null };
  daily: { date: string; visitors: number; analyses: number; leads: number }[];
  funnel: { name: string; sessions: number }[];
  breakdowns: Record<string, Row[]>;
}
interface SessionSummary {
  sid: string; first_at: string; last_at: string; events: number; steps: string[]; furthest: string;
  source: string; campaign: string | null; device: string; os: string; browser: string; country: string; city: string | null;
  provider: string | null; color: string | null; recommended_color: string | null; annual_kwh: number | null; best_savings: number | null;
  tariffs: string[]; channels: string[]; errors: string[]; lead: { id: string; name: string; status: string } | null;
}
interface Drill { title: string; type?: FilterType; value?: string }

const STEP_ICON: Record<string, string> = {
  page_view: "👀", upload_start: "📄", analysis_ok: "✅", analysis_error: "⚠️", tariff_click: "🔗", lead_open: "📝", lead_submit: "🎯", contact_click: "📞",
};
const STEP_LABEL: Record<string, string> = {
  page_view: "Μπήκε στο site", upload_start: "Ανέβασε λογαριασμό", analysis_ok: "Πήρε ανάλυση", analysis_error: "Σφάλμα ανάλυσης",
  tariff_click: "Πάτησε πρόγραμμα", lead_open: "Άνοιξε τη φόρμα", lead_submit: "Έστειλε τη φόρμα", contact_click: "Πάτησε επικοινωνία",
};
const PROP_LABEL: Record<string, string> = {
  provider: "Πάροχος", color: "Χρώμα", annual_kwh: "kWh/έτος", current_annual: "Σήμερα €/έτος", recommended_color: "Πρόταση",
  best_savings: "Κέρδος €/έτος", tariff: "Πρόγραμμα", channel: "Κανάλι", message: "Μήνυμα", type: "Αρχείο",
};
const COLOR_WORD: Record<string, string> = { blue: "🔵 Μπλε", green: "🟢 Πράσινο", yellow: "🟡 Κίτρινο", orange: "🟠 Πορτοκαλί" };
const DEVICE_ICON: Record<string, string> = { "Κινητό": "📱", "Υπολογιστής": "💻", "Tablet": "📲" };
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🌍");
const pct = (n: number) => `${(n * 100).toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`;
const shortDate = (d: string) => { const [, m, day] = d.split("-"); return `${day}/${m}`; };

function BreakdownCard({ title, rows, total, onPick, icon }: { title: string; rows: Row[]; total: number; onPick: (r: Row) => void; icon?: (r: Row) => string }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={card}>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Δεν υπάρχουν ακόμα δεδομένα</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {shown.map((r) => (
            <li key={r.key}>
              <button onClick={() => onPick(r)} className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-200 group-hover:text-white">{icon ? `${icon(r)} ` : ""}{r.label}</span>
                  <span className="shrink-0 text-white">
                    {r.count}
                    {total > 0 && <span className="ml-1.5 text-xs text-slate-500">{pct(r.count / total)}</span>}
                    <span className="ml-1 text-slate-600 group-hover:text-cyan-300">›</span>
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-white/5"><div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${(r.count / max) * 100}%` }} /></div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 6 && (
        <button className="mt-2 text-xs font-semibold text-cyan-300 underline" onClick={() => setAll((v) => !v)}>{all ? "Λιγότερα" : `Όλα (${rows.length})`}</button>
      )}
    </div>
  );
}

function DailyChart({ daily, onPick }: { daily: Stats["daily"]; onPick: (date: string) => void }) {
  const max = Math.max(1, ...daily.map((d) => d.visitors));
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? daily[hover] : null;
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ανά ημέρα</div>
        <div className="flex gap-3 text-[11px] text-slate-400">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-400/70" />Επισκέπτες</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-300" />Αναλύσεις</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-400" />Leads</span>
        </div>
      </div>
      <div className="mt-2 h-5 text-xs text-slate-300">
        {h ? <>{shortDate(h.date)}: <b className="text-white">{h.visitors}</b> επισκέπτες · <b className="text-white">{h.analyses}</b> αναλύσεις · <b className="text-white">{h.leads}</b> leads</> : <span className="text-slate-500">Πάτα σε μια μέρα για να δεις τους επισκέπτες της</span>}
      </div>
      <div className="mt-2 flex h-36 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {daily.map((d, i) => (
          <button
            key={d.date}
            title={`${shortDate(d.date)}: ${d.visitors} επισκέπτες`}
            onMouseEnter={() => setHover(i)}
            onClick={() => (setHover(i), d.visitors > 0 && onPick(d.date))}
            className={`relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t ${hover === i ? "bg-white/[0.06]" : ""}`}
          >
            <div className="w-full rounded-t bg-blue-400/60" style={{ height: `${(d.visitors / max) * 100}%` }}>
              <div className="w-full rounded-t bg-cyan-300" style={{ height: d.visitors ? `${(d.analyses / d.visitors) * 100}%` : 0 }} />
            </div>
            {d.leads > 0 && <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-violet-400" />}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{shortDate(daily[0]?.date ?? "")}</span><span>{shortDate(daily[daily.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}

function SessionJourney({ sid, onClose, onOpenLead }: { sid: string; onClose: () => void; onOpenLead: (id: string) => void }) {
  const [data, setData] = useState<{ events: { created_at: string; name: string; path: string | null; props: Record<string, unknown> | null; source: Record<string, string> | null }[]; lead: { id: string; name: string; status: LeadStatus; phone: string } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<typeof data>(`/api/admin/sessions/${encodeURIComponent(sid)}`).then(setData).catch((e) => setError(e.message)); }, [sid]);
  const first = data?.events[0];
  const ctx = (first?.props ?? {}) as Record<string, string>;
  const src = first?.source ?? {};
  const detail = (p: Record<string, unknown> | null) =>
    Object.entries(p ?? {})
      .filter(([k, v]) => v !== null && v !== "" && !["device", "os", "browser", "country", "city"].includes(k))
      .map(([k, v]) => `${PROP_LABEL[k] ?? k}: ${COLOR_WORD[String(v)] ?? v}`)
      .join(" · ");

  return (
    <div className="fixed inset-0 z-[35] flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Διαδρομή επισκέπτη</h2>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {!data ? <p className="mt-4 text-sm text-slate-500">Φόρτωση…</p> : (
          <div className="mt-4 space-y-4">
            {data.lead && (
              <button onClick={() => onOpenLead(data.lead!.id)} className={`${card} flex w-full items-center justify-between text-left hover:ring-white/25`}>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500">Έγινε πελάτης</div>
                  <div className="font-semibold text-white">🎯 {data.lead.name} · {data.lead.phone}</div>
                </div>
                <Badge status={data.lead.status} />
              </button>
            )}
            <div className={`${card} grid grid-cols-2 gap-x-4 gap-y-1 text-sm`}>
              <span className="text-slate-500">Πηγή</span><span className="break-all">{src.utm_source || src.referrer || "Απευθείας"}{src.utm_campaign ? ` / ${src.utm_campaign}` : ""}</span>
              <span className="text-slate-500">Σελίδα εισόδου</span><span className="break-all">{src.landing ?? "/"}</span>
              <span className="text-slate-500">Συσκευή</span><span>{DEVICE_ICON[ctx.device] ?? ""} {ctx.device ?? "Άγνωστο"} · {ctx.os ?? "—"} · {ctx.browser ?? "—"}</span>
              <span className="text-slate-500">Τοποθεσία</span><span>{ctx.country ? `${flag(ctx.country)} ${ctx.city ? `${ctx.city}, ` : ""}${ctx.country}` : "Άγνωστο"}</span>
              <span className="text-slate-500">Πρώτη φορά</span><span>{src.first_seen ? when(src.first_seen) : first ? when(first.created_at) : "—"}</span>
            </div>
            <ol className="relative space-y-2 border-l border-white/10 pl-4">
              {data.events.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[22px] top-2 grid h-3 w-3 place-items-center rounded-full bg-cyan-400/80" />
                  <div className="rounded-xl bg-white/[0.02] p-3 text-sm ring-1 ring-white/10">
                    <div className="flex justify-between gap-2"><span className="text-slate-100">{STEP_ICON[e.name] ?? "•"} {STEP_LABEL[e.name] ?? e.name}</span><span className="shrink-0 text-xs text-slate-500">{when(e.created_at)}</span></div>
                    {detail(e.props) && <div className="mt-1 break-words text-xs text-slate-400">{detail(e.props)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </aside>
    </div>
  );
}

function SessionList({ drill, days, onClose, onOpen }: { drill: Drill; days: number; onClose: () => void; onOpen: (sid: string) => void }) {
  const [data, setData] = useState<{ total: number; sessions: SessionSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ days: String(days), ...(drill.type ? { type: drill.type, value: drill.value ?? "" } : {}) });
    api<typeof data>(`/api/admin/sessions?${q}`).then(setData).catch((e) => setError(e.message));
  }, [drill, days]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-slate-500">Επισκέπτες · {days} ημέρες</div>
            <h2 className="truncate text-lg font-semibold text-white">{drill.title}</h2>
          </div>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {!data ? <p className="mt-4 text-sm text-slate-500">Φόρτωση…</p> : (
          <>
            <p className="mt-3 text-sm text-slate-400">{data.total} επισκέπτες{data.total > data.sessions.length ? ` (εμφανίζονται οι ${data.sessions.length} πιο πρόσφατοι)` : ""}</p>
            <ul className="mt-3 space-y-2">
              {data.sessions.map((s) => (
                <li key={s.sid}>
                  <button onClick={() => onOpen(s.sid)} className={`${card} w-full p-3 text-left transition hover:ring-white/25`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {DEVICE_ICON[s.device] ?? "❔"} {s.source}{s.campaign ? ` / ${s.campaign}` : ""}
                      </span>
                      {s.lead ? <Badge status={s.lead.status as LeadStatus} /> : (
                        <span className="whitespace-nowrap rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-white/10">{STEP_ICON[s.furthest]} {STEP_LABEL[s.furthest]}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {when(s.last_at)} · {s.country !== "Άγνωστο" ? `${flag(s.country)} ${s.city ?? s.country}` : "🌍"} · {s.os} · {s.events} ενέργειες
                    </div>
                    {(s.provider || s.lead) && (
                      <div className="mt-1 text-xs text-slate-300">
                        {s.lead && <>🎯 {s.lead.name} · </>}
                        {s.provider && <>Λογαριασμός: {s.provider}{s.annual_kwh ? ` · ${s.annual_kwh.toLocaleString("el-GR")} kWh` : ""}{s.best_savings ? ` · κέρδος ~${eur(s.best_savings)}` : ""}</>}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

function StatsView({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [journey, setJourney] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    setError(null);
    api<Stats>(`/api/admin/stats?days=${days}`).then(setStats).catch((e) => setError(e.message));
  }, [days]);

  const pick = (title: string) => (r: Row) => setDrill({ title: `${title}: ${r.label}`, type: r.filter.type, value: r.filter.value });
  const k = stats?.kpis;
  const top = stats?.funnel[0]?.sessions || 1;
  const visitors = k?.visitors ?? 0;
  const analyses = k?.analyses ?? 0;

  const kpiCards: { label: string; value: string; sub?: string; drill?: Drill }[] = k ? [
    { label: "Επισκέπτες", value: String(k.visitors), sub: `${k.returning} ξαναήρθαν`, drill: { title: "Όλοι οι επισκέπτες" } },
    { label: "Αναλύσεις", value: String(k.analyses), sub: k.visitors ? pct(k.analyses / k.visitors) : undefined, drill: { title: "Πήραν ανάλυση", type: "step", value: "analysis_ok" } },
    { label: "Leads", value: String(k.leads), sub: `μετατροπή ${pct(k.conversion)}`, drill: { title: "Έστειλαν φόρμα", type: "lead", value: "yes" } },
    { label: "Υπογραφές", value: String(k.signed) },
    { label: "Μέση εξοικονόμηση", value: k.avgSavings !== null ? eur(k.avgSavings) : "—", sub: "ανά έτος, στην πρόταση" },
    { label: "Μέση κατανάλωση", value: k.avgKwh !== null ? `${Math.round(k.avgKwh).toLocaleString("el-GR")} kWh` : "—", sub: "ανά έτος" },
  ] : [];

  const b = stats?.breakdowns ?? {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Από πού έρχονται και τι κάνουν</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? btn : btnGhost} onClick={() => setDays(d)}>{d} ημ.</button>
          ))}
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {!stats ? <p className="text-sm text-slate-500">Φόρτωση…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {kpiCards.map((c) => (
              <button
                key={c.label}
                disabled={!c.drill}
                onClick={() => c.drill && setDrill(c.drill)}
                className={`${card} text-left ${c.drill ? "transition hover:ring-white/25" : "cursor-default"}`}
              >
                <div className="flex justify-between text-[11px] uppercase tracking-wider text-slate-500"><span>{c.label}</span>{c.drill && <span className="text-slate-600">›</span>}</div>
                <div className="mt-1 text-xl font-bold text-white">{c.value}</div>
                {c.sub && <div className="text-xs text-slate-400">{c.sub}</div>}
              </button>
            ))}
          </div>

          <DailyChart daily={stats.daily} onPick={(d) => setDrill({ title: `Ημέρα: ${shortDate(d)}`, type: "date", value: d })} />

          <div className={card}>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Πορεία επισκεπτών (μοναδικοί) · πάτα ένα βήμα</div>
            <ol className="mt-3 space-y-1">
              {stats.funnel.map((f, i) => (
                <li key={f.name}>
                  <button className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/5" onClick={() => setDrill({ title: EVENT_LABEL[f.name] ?? f.name, type: "step", value: f.name })}>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300 group-hover:text-white">{STEP_ICON[f.name]} {EVENT_LABEL[f.name] ?? f.name}</span>
                      <span className="font-semibold text-white">
                        {f.sessions}
                        {i > 0 && stats.funnel[i - 1].sessions > 0 && <span className="ml-2 text-xs font-normal text-slate-500">{Math.round((f.sessions / stats.funnel[i - 1].sessions) * 100)}%</span>}
                        <span className="ml-1 text-slate-600 group-hover:text-cyan-300">›</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${(f.sessions / top) * 100}%` }} /></div>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <h3 className="pt-2 text-sm font-semibold text-white">Από πού</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <BreakdownCard title="Πηγές" rows={b.sources ?? []} total={visitors} onPick={pick("Πηγή")} />
            <BreakdownCard title="Καμπάνιες (utm_campaign)" rows={b.campaigns ?? []} total={visitors} onPick={pick("Καμπάνια")} />
            <BreakdownCard title="Χώρες" rows={b.countries ?? []} total={visitors} onPick={pick("Χώρα")} icon={(r) => flag(r.key)} />
            <BreakdownCard title="Πόλεις" rows={b.cities ?? []} total={visitors} onPick={pick("Πόλη")} />
          </div>

          <h3 className="pt-2 text-sm font-semibold text-white">Με τι</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <BreakdownCard title="Συσκευές" rows={b.devices ?? []} total={visitors} onPick={pick("Συσκευή")} icon={(r) => DEVICE_ICON[r.key] ?? "❔"} />
            <BreakdownCard title="Λειτουργικά" rows={b.os ?? []} total={visitors} onPick={pick("Λειτουργικό")} />
            <BreakdownCard title="Browsers / εφαρμογές" rows={b.browsers ?? []} total={visitors} onPick={pick("Browser")} />
          </div>

          <h3 className="pt-2 text-sm font-semibold text-white">Τι λογαριασμούς ανεβάζουν</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <BreakdownCard title="Πάροχος σήμερα" rows={b.providers ?? []} total={analyses} onPick={pick("Πάροχος")} />
            <BreakdownCard title="Χρώμα τιμολογίου σήμερα" rows={b.colors ?? []} total={analyses} onPick={pick("Χρώμα")} />
            <BreakdownCard title="Χρώμα που προτείναμε" rows={b.recommended ?? []} total={analyses} onPick={pick("Πρόταση")} />
          </div>

          <h3 className="pt-2 text-sm font-semibold text-white">Τι τους ενδιαφέρει</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <BreakdownCard title="Προγράμματα που πάτησαν" rows={b.tariffs ?? []} total={visitors} onPick={pick("Πρόγραμμα")} />
            <BreakdownCard title="Κανάλια επικοινωνίας" rows={b.channels ?? []} total={visitors} onPick={pick("Κανάλι")} />
          </div>

          <h3 className="pt-2 text-sm font-semibold text-white">Πότε</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <BreakdownCard title="Ώρα (Ελλάδας)" rows={(b.hours ?? []).filter((r) => r.count > 0).sort((x, y) => Number(x.key) - Number(y.key))} total={visitors} onPick={pick("Ώρα")} />
            <BreakdownCard title="Ημέρα εβδομάδας" rows={(b.weekdays ?? []).filter((r) => r.count > 0)} total={visitors} onPick={pick("Ημέρα")} />
          </div>

          {(b.errors ?? []).length > 0 && (
            <BreakdownCard title="⚠️ Σφάλματα ανάλυσης" rows={b.errors} total={visitors} onPick={pick("Σφάλμα")} />
          )}
        </>
      )}

      {drill && <SessionList drill={drill} days={days} onClose={() => setDrill(null)} onOpen={setJourney} />}
      {journey && <SessionJourney sid={journey} onClose={() => setJourney(null)} onOpenLead={onOpenLead} />}
    </div>
  );
}

/* ───────────── page ───────────── */

function toCsv(leads: Lead[]) {
  const cols: (keyof Lead)[] = ["created_at", "name", "phone", "email", "status", "tariff_label", "current_provider", "current_program", "annual_kwh", "current_annual", "offer_annual", "savings", "signed_provider", "expected_commission", "next_follow_up", "preferred_time", "message", "consent_marketing"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...leads.map((l) => cols.map((c) => esc(l[c])).join(","))].join("\n");
}

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"leads" | "stats">("leads");
  const [status, setStatus] = useState<"all" | "open" | LeadStatus>("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ leads: Lead[] }>("/api/admin/leads");
      setLeads(d.leads);
      setAuthed(true);
    } catch (e: any) {
      if (e.status === 401) setAuthed(false);
      else {
        setAuthed(true);
        setError(e.message);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads
      .filter((l) => status === "all" || (status === "open" ? !["active", "lost"].includes(l.status) : l.status === status))
      .filter((l) => !needle || [l.name, l.phone, l.email, l.tariff_label, l.current_provider].some((v) => v?.toLowerCase().includes(needle)));
  }, [leads, status, q]);

  const kpi = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      newWeek: leads.filter((l) => new Date(l.created_at).getTime() >= weekAgo).length,
      open: leads.filter((l) => ["new", "contacted", "offer"].includes(l.status)).length,
      signed: leads.filter((l) => ["signed", "active"].includes(l.status)).length,
      commission: leads.filter((l) => ["signed", "active"].includes(l.status)).reduce((s, l) => s + (Number(l.expected_commission) || 0), 0),
      due: leads.filter((l) => l.next_follow_up && l.next_follow_up <= today && !["active", "lost"].includes(l.status)).length,
    };
  }, [leads, today]);

  if (authed === null) return <main className="p-10 text-center text-slate-500">Φόρτωση…</main>;
  if (!authed) return <Login onDone={load} />;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-white">Billi <span className="text-gradient">CRM</span></h1>
        <div className="flex gap-2">
          <button className={tab === "leads" ? btn : btnGhost} onClick={() => setTab("leads")}>Πελάτες</button>
          <button className={tab === "stats" ? btn : btnGhost} onClick={() => setTab("stats")}>Στατιστικά</button>
          <button
            className={btnGhost}
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              setAuthed(false);
            }}
          >
            Έξοδος
          </button>
        </div>
      </header>

      {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-400/30">⚠️ {error}</p>}

      {tab === "stats" ? (
        <div className="mt-6"><StatsView onOpenLead={setOpenId} /></div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Νέα (7 ημ.)", kpi.newWeek],
              ["Σε εξέλιξη", kpi.open],
              ["Για κλήση σήμερα", kpi.due],
              ["Υπογραφές", kpi.signed],
              ["Προμήθειες", eur(kpi.commission)],
            ].map(([label, v]) => (
              <div key={label as string} className={card}>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
                <div className="mt-1 text-xl font-bold text-white">{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <select className={`${input} w-44`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="open">Ανοιχτά</option>
              <option value="all">Όλα</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <input className={`${input} min-w-0 flex-1`} placeholder="Αναζήτηση: όνομα, τηλέφωνο, πάροχος…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className={btnGhost} onClick={load}>↻</button>
            <button
              className={btnGhost}
              onClick={() => {
                const url = URL.createObjectURL(new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8" }));
                const a = Object.assign(document.createElement("a"), { href: url, download: `billi-leads-${today}.csv` });
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              ⬇ CSV
            </button>
          </div>

          <ul className="mt-4 space-y-2">
            {shown.length === 0 && <li className="rounded-xl bg-white/5 p-4 text-sm text-slate-400">Κανένας πελάτης εδώ.</li>}
            {shown.map((l) => (
              <li key={l.id}>
                <button onClick={() => setOpenId(l.id)} className={`${card} w-full text-left transition hover:ring-white/25`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{l.name} <span className="font-normal text-slate-400">· {l.phone}</span></div>
                      <div className="truncate text-sm text-slate-400">{l.tariff_label ?? "Γενική επικοινωνία"}{l.current_provider ? ` · τώρα ${l.current_provider}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {l.next_follow_up && l.next_follow_up <= today && !["active", "lost"].includes(l.status) && (
                        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200">📅 κλήση</span>
                      )}
                      <Badge status={l.status} />
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {when(l.created_at)}{l.savings ? ` · εξοικονόμηση ${eur(l.savings)}` : ""}{l.source?.utm_source ? ` · ${l.source.utm_source}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {openId && (
        <LeadDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={(u) => setLeads((ls) => ls.map((l) => (l.id === u.id ? u : l)))}
        />
      )}
    </main>
  );
}

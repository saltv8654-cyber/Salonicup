"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lead, LeadActivity, LeadStatus } from "@/lib/db";
import { L, SqlStep, api, btn, btnGhost, card, eur, input, when } from "./ui";
import { EnergyView } from "./energy";
import TIERS_SQL from "@/supabase/migrations/20261106_tariff_tiers.sql";

const STATUS: Record<LeadStatus, { label: string; cls: string }> = {
  new: { label: "Νέο αίτημα", cls: "bg-cyan-400/15 text-cyan-200 ring-cyan-300/40" },
  contacted: { label: "Επικοινωνία", cls: "bg-blue-400/15 text-blue-200 ring-blue-300/40" },
  evaluation: { label: "Υπό αξιολόγηση", cls: "bg-indigo-400/15 text-indigo-200 ring-indigo-300/40" },
  offer: { label: "Προσφορά", cls: "bg-violet-400/15 text-violet-200 ring-violet-300/40" },
  signed: { label: "Υπογραφή", cls: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/40" },
  active: { label: "Ολοκληρώθηκε", cls: "bg-emerald-500/25 text-emerald-100 ring-emerald-300/50" },
  lost: { label: "Απορρίφθηκε", cls: "bg-white/5 text-slate-400 ring-white/15" },
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
  manual_calc: "Υπολόγισαν χωρίς λογαριασμό",
};



function Badge({ status }: { status: LeadStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS[status].cls}`}>{STATUS[status].label}</span>;
}

/* ───────────── login ───────────── */

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [name, setName] = useState(() => {
    try { return localStorage.getItem("billi_admin_name") ?? ""; } catch { return ""; }
  });
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
            try { localStorage.setItem("billi_admin_name", name.trim()); } catch { /* private mode */ }
            await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password, name }) });
            onDone();
          } catch (err: any) {
            setError(err.message === "unauthorized" ? "Λάθος κωδικός" : err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-lg font-semibold text-white">Billi CRM</h1>
        <input className={input} placeholder="Το όνομά σου (για το ιστορικό αλλαγών)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
        <input type="password" autoFocus className={input} placeholder="Κωδικός" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button className={`${btn} w-full`} disabled={busy}>{busy ? "…" : "Είσοδος"}</button>
      </form>
    </main>
  );
}

function BillAttachment({ lead, onChanged }: { lead: Lead; onChanged: () => void }) {
  const file = ((lead.bill ?? null) as { _file?: { name: string; type: string; size: number; uploaded_at: string } } | null)?._file;
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!file) return <div className="pt-2 text-xs text-slate-500">📎 Δεν επισύναψε λογαριασμό</div>;

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ url: string; file: { type: string } }>(`/api/admin/leads/${lead.id}/attachment`);
      setPreview({ url: d.url, type: d.file.type });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm("Οριστική διαγραφή του αρχείου του λογαριασμού;")) return;
    setBusy(true);
    try {
      await api(`/api/admin/leads/${lead.id}/attachment`, { method: "DELETE" });
      setPreview(null);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-200">📎 Λογαριασμός ({file.type === "application/pdf" ? "PDF" : "εικόνα"}, {Math.round(file.size / 1024)} KB)</div>
        <div className="flex gap-2">
          <button className={btn + " !px-3 !py-1.5 text-xs"} disabled={busy} onClick={open}>📄 Δες τον λογαριασμό</button>
          <button className={btnGhost + " !px-3 !py-1.5 text-xs"} disabled={busy} onClick={remove}>🗑</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {preview && (
        <div className="space-y-2">
          {preview.type.startsWith("image/") ? (
            <img src={preview.url} alt="Λογαριασμός" className="max-h-[70vh] w-full rounded-lg object-contain ring-1 ring-white/10" />
          ) : (
            <iframe src={preview.url} title="Λογαριασμός" className="h-[70vh] w-full rounded-lg bg-white ring-1 ring-white/10" />
          )}
          <a href={preview.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline">Άνοιγμα σε νέα καρτέλα ↗</a>
          <span className="ml-2 text-[11px] text-slate-500">ο σύνδεσμος λήγει σε 5 λεπτά</span>
        </div>
      )}
    </div>
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
              <BillAttachment lead={lead} onChanged={load} />
              <div className="text-xs text-slate-500">Συναίνεση επικοινωνίας ✓{lead.consent_marketing ? " · ενημερωτικά ✓" : ""}</div>
            </div>

            <div className={`${card} grid grid-cols-2 gap-x-4 gap-y-1 text-sm`}>
              <span className="text-slate-500">Υπηρεσία</span><span className="text-white">{lead.requested_service ?? "—"}{lead.user_id ? <span className="ml-2 text-[11px] text-cyan-300">👤 έχει λογαριασμό</span> : null}</span>
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
  kpis: { visitors: number; returning: number; analyses: number; manual?: number; leads: number; signed: number; conversion: number; avgSavings: number | null; avgKwh: number | null };
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
  page_view: "👀", upload_start: "📄", manual_calc: "🧮", analysis_ok: "✅", analysis_error: "⚠️", tariff_click: "🔗", lead_open: "📝", lead_submit: "🎯", contact_click: "📞",
};
const STEP_LABEL: Record<string, string> = {
  page_view: "Μπήκε στο site", upload_start: "Ανέβασε λογαριασμό", analysis_ok: "Πήρε ανάλυση", analysis_error: "Σφάλμα ανάλυσης",
  tariff_click: "Πάτησε πρόγραμμα", lead_open: "Άνοιξε τη φόρμα", lead_submit: "Έστειλε τη φόρμα", contact_click: "Πάτησε επικοινωνία",
  manual_calc: "Υπολόγισε χωρίς λογαριασμό",
};
const PROP_LABEL: Record<string, string> = {
  provider: "Πάροχος", color: "Χρώμα", annual_kwh: "kWh/έτος", current_annual: "Σήμερα €/έτος", recommended_color: "Πρόταση",
  best_savings: "Κέρδος €/έτος", tariff: "Πρόγραμμα", kwh_month: "kWh/μήνα", program: "Πρόγραμμα σήμερα", channel: "Κανάλι", message: "Μήνυμα", type: "Αρχείο",
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
    { label: "Υπολογισμοί", value: String(k.manual ?? 0), sub: "χωρίς λογαριασμό", drill: { title: "Υπολόγισαν χωρίς λογαριασμό", type: "step", value: "manual_calc" } },
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

/* ───────────── tariffs ───────────── */

interface TariffRow {
  id: string; created_at: string; updated_at: string; provider: string; name: string;
  color: "blue" | "green" | "yellow" | "orange"; fixed_monthly_eur: number | string; price_per_kwh_eur: number | string;
  price_per_kwh_with_discount_eur: number | string | null; discount_condition: string | null; min_duration_months: number | null;
  valid_month: string; url: string | null; active: boolean; category?: "electricity" | "gas";
  day_night?: boolean; price_per_kwh_night_eur?: number | string | null; promo_discount?: string | null; early_termination_fee?: string | null;
  conditions?: string | null; valid_from?: string | null; valid_until?: string | null; last_verified_at?: string | null;
  data_status?: "verified" | "unverified"; updated_by?: string | null;
}
type EnergyCat = "electricity" | "gas";
const rowCat = (r: TariffRow): EnergyCat => r.category ?? "electricity";
const UPGRADE_SQL = `alter table tariffs add column if not exists category text not null default 'electricity'
  check (category in ('electricity', 'gas'));

create table if not exists telecom_plans (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null check (kind in ('internet', 'mobile')),
  provider text not null,
  name text not null,
  monthly_eur numeric(8, 2) not null,
  promo_eur numeric(8, 2),
  promo_months integer,
  commitment_months integer,
  speed_mbps integer,
  tech text,
  data_gb numeric(8, 1),
  notes text,
  valid_month text not null,
  url text,
  active boolean not null default true
);
alter table telecom_plans enable row level security;`;


const COLOR_OPTS = [
  { v: "blue", l: "🔵 Μπλε (σταθερό)" }, { v: "green", l: "🟢 Πράσινο (ανακοινώνεται 1η του μήνα)" },
  { v: "yellow", l: "🟡 Κίτρινο (χονδρεμπορική)" }, { v: "orange", l: "🟠 Πορτοκαλί (δυναμικό)" },
] as const;
const COLOR_DOT: Record<string, string> = { blue: "🔵", green: "🟢", yellow: "🟡", orange: "🟠" };
const thisMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" }).slice(0, 7);
const TARIFFS_SQL = `create table if not exists tariffs (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider text not null,
  name text not null,
  color text not null check (color in ('blue', 'green', 'yellow', 'orange')),
  fixed_monthly_eur numeric(8, 2) not null,
  price_per_kwh_eur numeric(8, 5) not null,
  price_per_kwh_with_discount_eur numeric(8, 5),
  discount_condition text,
  min_duration_months integer,
  valid_month text not null,
  url text,
  active boolean not null default true
);
create index if not exists tariffs_provider_idx on tariffs (provider);
alter table tariffs enable row level security;`;

type TariffForm = {
  provider: string; name: string; color: TariffRow["color"]; fixed_monthly_eur: string; price_per_kwh_eur: string;
  price_per_kwh_with_discount_eur: string; discount_condition: string; min_duration_months: string; valid_month: string; url: string; active: boolean;
  day_night: boolean; price_per_kwh_night_eur: string; promo_discount: string; early_termination_fee: string; conditions: string;
  valid_from: string; valid_until: string; verified: boolean;
};
const toForm = (t?: TariffRow, category?: EnergyCat): TariffForm => ({
  provider: t?.provider ?? "", name: t?.name ?? "", color: t?.color ?? "blue",
  fixed_monthly_eur: t ? String(Number(t.fixed_monthly_eur)) : "", price_per_kwh_eur: t ? String(Number(t.price_per_kwh_eur)) : "",
  price_per_kwh_with_discount_eur: t?.price_per_kwh_with_discount_eur != null ? String(Number(t.price_per_kwh_with_discount_eur)) : "",
  discount_condition: t?.discount_condition ?? "", min_duration_months: t?.min_duration_months != null ? String(t.min_duration_months) : "",
  valid_month: t?.valid_month ?? thisMonth(), url: t?.url ?? "", active: t?.active ?? true,
  day_night: !!t?.day_night, price_per_kwh_night_eur: t?.price_per_kwh_night_eur != null ? String(Number(t.price_per_kwh_night_eur)) : "",
  promo_discount: t?.promo_discount ?? "", early_termination_fee: t?.early_termination_fee ?? "", conditions: t?.conditions ?? "",
  valid_from: t?.valid_from ?? "", valid_until: t?.valid_until ?? "", verified: false,
});
const dec = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));


function TariffEditor({ initial, providers, onClose, onSaved, category }: { initial?: TariffRow; providers: string[]; onClose: () => void; onSaved: () => void; category: EnergyCat }) {
  const [f, setF] = useState<TariffForm>(toForm(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TariffForm>(k: K, v: TariffForm[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      provider: f.provider, name: f.name, color: f.color,
      fixed_monthly_eur: dec(f.fixed_monthly_eur) ?? NaN, price_per_kwh_eur: dec(f.price_per_kwh_eur) ?? NaN,
      price_per_kwh_with_discount_eur: dec(f.price_per_kwh_with_discount_eur),
      discount_condition: f.discount_condition || null,
      min_duration_months: f.min_duration_months ? Math.round(Number(f.min_duration_months)) : null,
      valid_month: f.valid_month, url: f.url, active: f.active, category,
      day_night: f.day_night, price_per_kwh_night_eur: f.day_night ? dec(f.price_per_kwh_night_eur) : null,
      promo_discount: f.promo_discount || null, early_termination_fee: f.early_termination_fee || null, conditions: f.conditions || null,
      valid_from: f.valid_from || null, valid_until: f.valid_until || null,
      ...(f.verified ? { verified: true } : {}),
    };
    try {
      await api(initial ? `/api/admin/tariffs/${encodeURIComponent(initial.id)}` : "/api/admin/tariffs", { method: initial ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (err: any) {
      setError(err.message === "missing_category" ? "Πρώτα τρέξε το SQL της αναβάθμισης για το αέριο (καρτέλα Αέριο)." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{initial ? "Αλλαγή προγράμματος" : "Νέο πρόγραμμα"} · {category === "gas" ? "🔥 Αέριο" : "⚡ Ρεύμα"}</h2>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={save}>
          <L t="Πάροχος *">
            <input className={input} list="providers" value={f.provider} onChange={(e) => set("provider", e.target.value)} required />
            <datalist id="providers">{providers.map((p) => <option key={p} value={p} />)}</datalist>
          </L>
          <L t="Όνομα προγράμματος *"><input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} required /></L>
          <L t="Χρώμα *">
            <select className={input} value={f.color} onChange={(e) => set("color", e.target.value as TariffRow["color"])}>
              {COLOR_OPTS.filter((c) => category !== "gas" || c.v !== "orange").map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Πάγιο €/μήνα *" hint="χωρίς ΦΠΑ"><input className={input} inputMode="decimal" value={f.fixed_monthly_eur} onChange={(e) => set("fixed_monthly_eur", e.target.value)} placeholder="5" required /></L>
            <L t="Τιμή €/kWh *" hint={category === "gas" ? "χωρίς ΦΠΑ, σε € ανά kWh (όχι m³), π.χ. 0.11" : "χωρίς ΦΠΑ, σε € (π.χ. 0.135)"}><input className={input} inputMode="decimal" value={f.price_per_kwh_eur} onChange={(e) => set("price_per_kwh_eur", e.target.value)} placeholder={category === "gas" ? "0.110" : "0.135"} required /></L>
            <L t="Τιμή με έκπτωση €/kWh" hint="αν υπάρχει έκπτωση υπό όρους"><input className={input} inputMode="decimal" value={f.price_per_kwh_with_discount_eur} onChange={(e) => set("price_per_kwh_with_discount_eur", e.target.value)} placeholder="0.120" /></L>
            <L t="Δέσμευση (μήνες)"><input className={input} inputMode="numeric" value={f.min_duration_months} onChange={(e) => set("min_duration_months", e.target.value)} placeholder="12" /></L>
          </div>
          <L t="Όρος / σημείωση" hint="π.χ. «με έγκαιρη εξόφληση», «έως 200 kWh/μήνα»"><input className={input} value={f.discount_condition} onChange={(e) => set("discount_condition", e.target.value)} /></L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Μήνας τιμής *"><input type="month" className={input} value={f.valid_month} onChange={(e) => set("valid_month", e.target.value)} required /></L>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
              <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Εμφανίζεται στο site
            </label>
          </div>
          <details className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/10" open={!!(f.day_night || f.promo_discount || f.early_termination_fee || f.conditions || f.valid_from || f.valid_until)}>
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">Περισσότερα: νύχτα, προσφορές, όροι, ισχύς</summary>
            <div className="mt-3 space-y-3">
              {category === "electricity" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
                    <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={f.day_night} onChange={(e) => set("day_night", e.target.checked)} /> Ημέρα / νύχτα
                  </label>
                  {f.day_night && <L t="Νυχτερινή €/kWh"><input className={input} inputMode="decimal" value={f.price_per_kwh_night_eur} onChange={(e) => set("price_per_kwh_night_eur", e.target.value)} placeholder="0.090" /></L>}
                </div>
              )}
              <L t="Προωθητική έκπτωση" hint="π.χ. «−20% τους 3 πρώτους μήνες»"><input className={input} value={f.promo_discount} onChange={(e) => set("promo_discount", e.target.value)} /></L>
              <L t="Χρέωση πρόωρης λήξης"><input className={input} value={f.early_termination_fee} onChange={(e) => set("early_termination_fee", e.target.value)} /></L>
              <L t="Λοιποί όροι"><input className={input} value={f.conditions} onChange={(e) => set("conditions", e.target.value)} /></L>
              <div className="grid grid-cols-2 gap-3">
                <L t="Ισχύει από"><input type="date" className={input} value={f.valid_from} onChange={(e) => set("valid_from", e.target.value)} /></L>
                <L t="Ισχύει έως"><input type="date" className={input} value={f.valid_until} onChange={(e) => set("valid_until", e.target.value)} /></L>
              </div>
            </div>
          </details>
          <L t="Link προγράμματος (πηγή)"><input className={input} value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://..." /></L>
          <label className="flex items-start gap-2 rounded-xl bg-emerald-400/[0.05] p-3 text-sm text-slate-300 ring-1 ring-emerald-300/20">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-400" checked={f.verified} onChange={(e) => set("verified", e.target.checked)} />
            <span>Έλεγξα τώρα την τιμή στην επίσημη πηγή του παρόχου. <span className="text-xs text-slate-500">Χωρίς αυτό, στο site φαίνεται ως «ενδεικτική».</span></span>
          </label>
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
          <button className={`${btn} w-full`} disabled={busy}>{busy ? "Αποθήκευση…" : "Αποθήκευση"}</button>
        </form>
      </aside>
    </div>
  );
}

function TariffsView({ category }: { category: EnergyCat }) {
  const [all, setAll] = useState<TariffRow[] | null>(null);
  const [hasCategory, setHasCategory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState<TariffRow | "new" | null>(null);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [msg, setMsg] = useState<string | null>(null);
  const [needTiers, setNeedTiers] = useState(false);

  const replaceWithRaaey = async () => {
    if (!confirm("Να διαγραφούν ΟΛΑ τα οικιακά προγράμματα ρεύματος και να μπουν τα 47 προγράμματα με τιμή από τη λίστα της ΡΑΑΕΥ (Νοέμβριος 2026);\n\nΤα παλιά μένουν στο ιστορικό τιμών.")) return;
    setMsg(null);
    setError(null);
    try {
      const r = await api<{ removed: number; added: number }>("/api/admin/tariffs/replace", { method: "POST", body: "{}" });
      setMsg(`Διαγράφηκαν ${r.removed} και μπήκαν ${r.added} προγράμματα της ΡΑΑΕΥ. Εμφανίζονται ήδη στο site.`);
      await load();
    } catch (e: any) {
      if (e.message === "missing_tiers") setNeedTiers(true);
      else setError(e.message);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<{ tariffs: TariffRow[]; has_category?: boolean }>("/api/admin/tariffs");
      setAll(d.tariffs);
      setHasCategory(d.has_category !== false);
      setMissing(false);
    } catch (e: any) {
      if (e.message === "missing_table") setMissing(true);
      else setError(e.message);
      setAll([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => (all ? all.filter((r) => rowCat(r) === category) : null), [all, category]);

  const providers = useMemo(() => [...new Set((rows ?? []).map((r) => r.provider))].sort((a, b) => a.localeCompare(b, "el")), [rows]);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => !needle || `${r.provider} ${r.name}`.toLowerCase().includes(needle));
    return providers.map((p) => ({ provider: p, list: list.filter((r) => r.provider === p) })).filter((g) => g.list.length > 0);
  }, [rows, providers, q]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!rows) return <p className="text-sm text-slate-500">Φόρτωση…</p>;

  if (missing) {
    return <SqlStep title="Ένα βήμα πριν" text="Για να αλλάζεις τιμές από εδώ, φτιάξε μία φορά τους πίνακες." sql={`${TARIFFS_SQL}\n\n${UPGRADE_SQL}`} onRetry={load} />;
  }
  if (category === "gas" && !hasCategory) {
    return <SqlStep title="Αναβάθμιση για αέριο και τηλεπικοινωνίες" text="Για να βάλεις τιμές αερίου και internet/κινητής, χρειάζεται μία μικρή αναβάθμιση της βάσης (μία φορά)." sql={UPGRADE_SQL} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{category === "gas" ? "🔥 Τιμές αερίου" : "⚡ Τιμές ρεύματος"}</h2>
          <p className="text-xs text-slate-400">Ό,τι αλλάζεις εδώ εμφανίζεται αμέσως στο site. Τιμές χωρίς ΦΠΑ, μόνο προμήθεια.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {category === "electricity" && <button className={btnGhost} onClick={replaceWithRaaey}>🏛 Τιμές ΡΑΑΕΥ (Νοέμβριος)</button>}
          <button className={btn} onClick={() => setEditing("new")}>＋ Νέο πρόγραμμα</button>
        </div>
      </div>
      {needTiers && (
        <SqlStep title="Μικρή αναβάθμιση για κλιμακωτές τιμές" text="Πολλά προγράμματα έχουν τιμή ανά κλιμάκιο κατανάλωσης. Τρέξε μία φορά αυτό το SQL (και το SQL της Διαχείρισης ενέργειας, αν δεν το έχεις τρέξει) και ξαναπάτα «Τιμές ΡΑΑΕΥ»." sql={TIERS_SQL} onRetry={() => { setNeedTiers(false); replaceWithRaaey(); }} />
      )}

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {msg && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">✓ {msg}</p>}

      {rows.length === 0 ? (
        category === "gas" ? (
          <div className={`${card} space-y-3 text-sm text-slate-300`}>
            <p>Δεν υπάρχουν ακόμα τιμές αερίου εδώ, οπότε το site δείχνει τις ενσωματωμένες επίσημες τιμές Νοεμβρίου (Heron, Protergia).</p>
            <button className={btn} onClick={() => act(() => api("/api/admin/tariffs/import?category=gas", { method: "POST" }), "Οι τιμές αερίου εισήχθησαν")}>
              ⬇ Εισαγωγή των τρεχουσών τιμών αερίου
            </button>
            <p>Ή πάτα «＋ Νέο πρόγραμμα» και πρόσθεσε προγράμματα (πάγιο €/μήνα και τιμή €/kWh χωρίς ΦΠΑ).</p>
          </div>
        ) : (
          <div className={`${card} space-y-3 text-sm text-slate-300`}>
            <p>Δεν υπάρχουν ακόμα τιμές εδώ, οπότε το site δείχνει τις ενσωματωμένες τιμές Νοεμβρίου.</p>
            <button className={btn} onClick={() => act(() => api("/api/admin/tariffs/import", { method: "POST" }), "Οι τρέχουσες τιμές εισήχθησαν")}>
              ⬇ Εισαγωγή των τρεχουσών τιμών
            </button>
          </div>
        )
      ) : (
        <>
          <div className={`${card} flex flex-wrap items-end gap-2`}>
            <label className="text-xs text-slate-400">Νέος μήνας για όλα τα ενεργά
              <input type="month" className={`${input} mt-1 w-44`} value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
            <button
              className={btnGhost}
              onClick={() => confirm(`Να γίνουν όλα τα ενεργά προγράμματα «${month}»; Έλεγξε πρώτα ότι οι τιμές τους ισχύουν.`) &&
                act(() => api("/api/admin/tariffs", { method: "PATCH", body: JSON.stringify({ valid_month: month, category }) }), `Ο μήνας άλλαξε σε ${month}`)}
            >
              📅 Εφαρμογή
            </button>
            <input className={`${input} min-w-0 flex-1`} placeholder="Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.provider} className={card}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-white">{g.provider}</div>
                  <div className="text-xs text-slate-500">{g.list.length} προγράμματα</div>
                </div>
                <ul className="mt-2 divide-y divide-white/5">
                  {g.list.map((t) => (
                    <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${t.active ? "" : "opacity-50"}`}>
                      <div className="min-w-0">
                        <div className="text-sm text-slate-100">
                          {COLOR_DOT[t.color]} {t.name}{!t.active && <span className="ml-2 text-xs text-slate-500">(κρυφό)</span>}
                          {t.data_status === "verified" && t.last_verified_at
                            ? <span className="ml-2 text-[11px] text-emerald-300" title={`Επιβεβαιώθηκε ${when(t.last_verified_at)}`}>✓ {new Date(t.last_verified_at).toLocaleDateString("el-GR")}</span>
                            : <span className="ml-2 text-[11px] text-amber-200">ενδεικτική</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                          {Number(t.price_per_kwh_with_discount_eur ?? t.price_per_kwh_eur).toFixed(4)} €/kWh · πάγιο {Number(t.fixed_monthly_eur).toFixed(2)} € · {t.valid_month}
                          {t.discount_condition ? ` · ${t.discount_condition}` : ""}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button className={btnGhost + " !px-3 !py-1.5 text-xs"} onClick={() => setEditing(t)}>✏️ Αλλαγή</button>
                        <button
                          className={btnGhost + " !px-3 !py-1.5 text-xs"}
                          onClick={() => act(() => api(`/api/admin/tariffs/${encodeURIComponent(t.id)}`, {
                            method: "PUT",
                            body: JSON.stringify({ ...toBody(t), active: !t.active }),
                          }), t.active ? "Κρύφτηκε από το site" : "Εμφανίζεται ξανά")}
                        >
                          {t.active ? "🙈 Απόκρυψη" : "👁 Εμφάνιση"}
                        </button>
                        <button
                          className={btnGhost + " !px-3 !py-1.5 text-xs"}
                          onClick={() => confirm(`Διαγραφή «${t.provider} ${t.name}»;`) && act(() => api(`/api/admin/tariffs/${encodeURIComponent(t.id)}`, { method: "DELETE" }), "Διαγράφηκε")}
                        >
                          🗑
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        <TariffEditor
          initial={editing === "new" ? undefined : editing}
          providers={providers}
          category={category}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg("Αποθηκεύτηκε"); load(); }}
        />
      )}
    </div>
  );
}

function toBody(t: TariffRow) {
  return {
    provider: t.provider, name: t.name, color: t.color,
    fixed_monthly_eur: Number(t.fixed_monthly_eur), price_per_kwh_eur: Number(t.price_per_kwh_eur),
    price_per_kwh_with_discount_eur: t.price_per_kwh_with_discount_eur != null ? Number(t.price_per_kwh_with_discount_eur) : null,
    discount_condition: t.discount_condition, min_duration_months: t.min_duration_months, valid_month: t.valid_month, url: t.url ?? "",
    category: rowCat(t),
  };
}

/* ───────────── prices: category switch + telecom ───────────── */

function PricesView() {
  const [cat, setCat] = useState<"electricity" | "gas" | "telecom">("electricity");
  const tabs = [
    { v: "electricity", l: "⚡ Ρεύμα" },
    { v: "gas", l: "🔥 Αέριο" },
    { v: "telecom", l: "📶 Internet & Κινητή" },
  ] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => <button key={t.v} className={cat === t.v ? btn : btnGhost} onClick={() => setCat(t.v)}>{t.l}</button>)}
      </div>
      {cat === "telecom" ? <TelecomAdminView /> : <TariffsView key={cat} category={cat} />}
    </div>
  );
}

interface TelecomRow {
  id: string; created_at: string; updated_at: string; kind: "internet" | "mobile"; provider: string; name: string;
  monthly_eur: number | string; promo_eur: number | string | null; promo_months: number | null; commitment_months: number | null;
  speed_mbps: number | null; tech: string | null; data_gb: number | string | null; notes: string | null; valid_month: string; url: string | null; active: boolean;
}
type TelecomForm = Record<"provider" | "name" | "monthly_eur" | "promo_eur" | "promo_months" | "commitment_months" | "speed_mbps" | "tech" | "data_gb" | "notes" | "valid_month" | "url", string> & { kind: "internet" | "mobile"; active: boolean };
const str = (v: unknown) => (v === null || v === undefined ? "" : String(Number.isNaN(Number(v)) ? v : Number(v)));
const toTelecomForm = (t?: TelecomRow, kind: "internet" | "mobile" = "internet"): TelecomForm => ({
  kind: t?.kind ?? kind, provider: t?.provider ?? "", name: t?.name ?? "", monthly_eur: str(t?.monthly_eur), promo_eur: str(t?.promo_eur),
  promo_months: str(t?.promo_months), commitment_months: str(t?.commitment_months ?? 24), speed_mbps: str(t?.speed_mbps), tech: t?.tech ?? "",
  data_gb: str(t?.data_gb), notes: t?.notes ?? "", valid_month: t?.valid_month ?? thisMonth(), url: t?.url ?? "", active: t?.active ?? true,
});
const telecomBody = (f: TelecomForm) => ({
  kind: f.kind, provider: f.provider, name: f.name, monthly_eur: dec(f.monthly_eur) ?? NaN, promo_eur: dec(f.promo_eur),
  promo_months: f.promo_months ? Math.round(Number(f.promo_months)) : null, commitment_months: f.commitment_months ? Math.round(Number(f.commitment_months)) : null,
  speed_mbps: f.speed_mbps ? Math.round(Number(f.speed_mbps)) : null, tech: f.tech || null, data_gb: dec(f.data_gb), notes: f.notes || null,
  valid_month: f.valid_month, url: f.url, active: f.active,
});
const telecomSpec = (t: TelecomRow) =>
  t.kind === "internet" ? `${t.speed_mbps ?? "?"} Mbps${t.tech ? ` · ${t.tech}` : ""}` : t.data_gb !== null ? `${Number(t.data_gb)} GB` : "Απεριόριστα data";

function TelecomEditor({ initial, providers, onClose, onSaved }: { initial?: TelecomRow; providers: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<TelecomForm>(toTelecomForm(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TelecomForm>(k: K, v: TelecomForm[K]) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(initial ? `/api/admin/telecom/${encodeURIComponent(initial.id)}` : "/api/admin/telecom", { method: initial ? "PUT" : "POST", body: JSON.stringify(telecomBody(f)) });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{initial ? "Αλλαγή προγράμματος" : "Νέο πρόγραμμα"} · 📶</h2>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={save}>
          <div className="flex gap-2">
            <button type="button" className={f.kind === "internet" ? btn : btnGhost} onClick={() => set("kind", "internet")}>🏠 Internet</button>
            <button type="button" className={f.kind === "mobile" ? btn : btnGhost} onClick={() => set("kind", "mobile")}>📱 Κινητή</button>
          </div>
          <L t="Πάροχος *">
            <input className={input} list="tproviders" value={f.provider} onChange={(e) => set("provider", e.target.value)} required />
            <datalist id="tproviders">{providers.map((p) => <option key={p} value={p} />)}</datalist>
          </L>
          <L t="Όνομα προγράμματος *"><input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} required /></L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Τιμή €/μήνα *" hint="με ΦΠΑ, μετά την προσφορά"><input className={input} inputMode="decimal" value={f.monthly_eur} onChange={(e) => set("monthly_eur", e.target.value)} placeholder="26" required /></L>
            <L t="Δέσμευση (μήνες)"><input className={input} inputMode="numeric" value={f.commitment_months} onChange={(e) => set("commitment_months", e.target.value)} placeholder="24" /></L>
            <L t="Τιμή προσφοράς €/μήνα" hint="αν υπάρχει"><input className={input} inputMode="decimal" value={f.promo_eur} onChange={(e) => set("promo_eur", e.target.value)} placeholder="20.80" /></L>
            <L t="Μήνες προσφοράς"><input className={input} inputMode="numeric" value={f.promo_months} onChange={(e) => set("promo_months", e.target.value)} placeholder="12" /></L>
            {f.kind === "internet" ? (
              <>
                <L t="Ταχύτητα (Mbps) *"><input className={input} inputMode="numeric" value={f.speed_mbps} onChange={(e) => set("speed_mbps", e.target.value)} placeholder="300" required /></L>
                <L t="Τεχνολογία"><input className={input} value={f.tech} onChange={(e) => set("tech", e.target.value)} placeholder="Οπτική ίνα / VDSL / 5G" /></L>
              </>
            ) : (
              <L t="Data (GB/μήνα)" hint="κενό = απεριόριστα"><input className={input} inputMode="decimal" value={f.data_gb} onChange={(e) => set("data_gb", e.target.value)} placeholder="20" /></L>
            )}
          </div>
          <L t="Σημείωση" hint="π.χ. «απεριόριστα λεπτά & SMS», «+3 € μετά τον 12ο μήνα»"><input className={input} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Μήνας τιμής *"><input type="month" className={input} value={f.valid_month} onChange={(e) => set("valid_month", e.target.value)} required /></L>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
              <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Εμφανίζεται στο site
            </label>
          </div>
          <L t="Link προγράμματος"><input className={input} value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://..." /></L>
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
          <button className={`${btn} w-full`} disabled={busy}>{busy ? "Αποθήκευση…" : "Αποθήκευση"}</button>
        </form>
      </aside>
    </div>
  );
}

function TelecomAdminView() {
  const [rows, setRows] = useState<TelecomRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<TelecomRow | "new" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<{ plans: TelecomRow[] }>("/api/admin/telecom");
      setRows(d.plans);
      setMissing(false);
    } catch (e: any) {
      if (e.message === "missing_table") setMissing(true);
      else setError(e.message);
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const providers = useMemo(() => [...new Set((rows ?? []).map((r) => r.provider))].sort((a, b) => a.localeCompare(b, "el")), [rows]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!rows) return <p className="text-sm text-slate-500">Φόρτωση…</p>;
  if (missing) return <SqlStep title="Αναβάθμιση για αέριο και τηλεπικοινωνίες" text="Για να αλλάζεις τιμές internet/κινητής από εδώ, χρειάζεται μία μικρή αναβάθμιση της βάσης (μία φορά)." sql={UPGRADE_SQL} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">📶 Internet & Κινητή</h2>
          <p className="text-xs text-slate-400">Τιμές με ΦΠΑ, όπως τις διαφημίζουν οι πάροχοι. Η σύγκριση στο site γίνεται με τον μέσο όρο 24 μηνών.</p>
        </div>
        <button className={btn} onClick={() => setEditing("new")}>＋ Νέο πρόγραμμα</button>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {msg && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">✓ {msg}</p>}
      {rows.length === 0 ? (
        <div className={`${card} space-y-3 text-sm text-slate-300`}>
          <p>Δεν υπάρχουν ακόμα προγράμματα εδώ, οπότε το site δείχνει τα ενσωματωμένα ενδεικτικά (Nova, Cosmote, Vodafone).</p>
          <button className={btn} onClick={() => act(() => api("/api/admin/telecom/import", { method: "POST" }), "Τα ενδεικτικά προγράμματα εισήχθησαν")}>⬇ Εισαγωγή των ενδεικτικών προγραμμάτων</button>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p} className={card}>
              <div className="font-semibold text-white">{p}</div>
              <ul className="mt-2 divide-y divide-white/5">
                {rows.filter((r) => r.provider === p).map((t) => (
                  <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${t.active ? "" : "opacity-50"}`}>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-100">{t.kind === "internet" ? "🏠" : "📱"} {t.name}{!t.active && <span className="ml-2 text-xs text-slate-500">(κρυφό)</span>}</div>
                      <div className="text-xs text-slate-400">
                        {telecomSpec(t)} · {Number(t.monthly_eur).toFixed(2)} €/μήνα
                        {t.promo_eur !== null && t.promo_months ? ` (${Number(t.promo_eur).toFixed(2)} € για ${t.promo_months} μήνες)` : ""} · {t.valid_month}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button className={btnGhost + " !px-3 !py-1.5 text-xs"} onClick={() => setEditing(t)}>✏️ Αλλαγή</button>
                      <button
                        className={btnGhost + " !px-3 !py-1.5 text-xs"}
                        onClick={() => act(() => api(`/api/admin/telecom/${encodeURIComponent(t.id)}`, { method: "PUT", body: JSON.stringify({ ...telecomBody(toTelecomForm(t)), active: !t.active }) }), t.active ? "Κρύφτηκε από το site" : "Εμφανίζεται ξανά")}
                      >
                        {t.active ? "🙈 Απόκρυψη" : "👁 Εμφάνιση"}
                      </button>
                      <button className={btnGhost + " !px-3 !py-1.5 text-xs"} onClick={() => confirm(`Διαγραφή «${t.provider} ${t.name}»;`) && act(() => api(`/api/admin/telecom/${encodeURIComponent(t.id)}`, { method: "DELETE" }), "Διαγράφηκε")}>🗑</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <TelecomEditor
          initial={editing === "new" ? undefined : editing}
          providers={providers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg("Αποθηκεύτηκε"); load(); }}
        />
      )}
    </div>
  );
}

/* ───────────── page ───────────── */

function toCsv(leads: Lead[]) {
  const cols: (keyof Lead)[] = ["created_at", "name", "phone", "email", "status", "requested_service", "tariff_label", "current_provider", "current_program", "annual_kwh", "current_annual", "offer_annual", "savings", "signed_provider", "expected_commission", "next_follow_up", "preferred_time", "message", "consent_marketing"];
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
  const [tab, setTab] = useState<"leads" | "stats" | "tariffs" | "energy">("leads");
  const [status, setStatus] = useState<"all" | "open" | LeadStatus>("open");
  const [q, setQ] = useState("");
  const [service, setService] = useState("all");
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
      .filter((l) => service === "all" || (l.requested_service ?? "—") === service)
      .filter((l) => !needle || [l.name, l.phone, l.email, l.tariff_label, l.current_provider, l.current_program, l.requested_service].some((v) => v?.toLowerCase().includes(needle)));
  }, [leads, status, q, service]);
  const services = useMemo(() => [...new Set(leads.map((l) => l.requested_service ?? "—"))].sort(), [leads]);

  const kpi = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      newWeek: leads.filter((l) => new Date(l.created_at).getTime() >= weekAgo).length,
      open: leads.filter((l) => ["new", "contacted", "evaluation", "offer"].includes(l.status)).length,
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
        <div className="flex flex-wrap gap-2">
          <button className={tab === "leads" ? btn : btnGhost} onClick={() => setTab("leads")}>Πελάτες</button>
          <button className={tab === "stats" ? btn : btnGhost} onClick={() => setTab("stats")}>Στατιστικά</button>
          <button className={tab === "tariffs" ? btn : btnGhost} onClick={() => setTab("tariffs")}>Τιμές</button>
          <button className={tab === "energy" ? btn : btnGhost} onClick={() => setTab("energy")}>⚡ Ενέργεια</button>
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

      {tab === "energy" ? (
        <div className="mt-6"><EnergyView /></div>
      ) : tab === "tariffs" ? (
        <div className="mt-6"><PricesView /></div>
      ) : tab === "stats" ? (
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
            <select className={`${input} w-56`} value={service} onChange={(e) => setService(e.target.value)} aria-label="Υπηρεσία">
              <option value="all">Όλες οι υπηρεσίες</option>
              {services.map((x) => <option key={x} value={x}>{x === "—" ? "Χωρίς υπηρεσία" : x}</option>)}
            </select>
            <input className={`${input} min-w-0 flex-1`} placeholder="Αναζήτηση: όνομα, τηλέφωνο, πάροχος, υπηρεσία…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                      <div className="font-semibold text-white">
                        {l.name} <span className="font-normal text-slate-400">· {l.phone}</span>
                        {(l.bill as { _file?: unknown } | null)?._file ? <span className="ml-1.5" title="Επισύναψε λογαριασμό">📎</span> : null}
                      </div>
                      <div className="truncate text-sm text-slate-400">{l.requested_service ? `${l.requested_service} · ` : ""}{l.tariff_label ?? "Γενική επικοινωνία"}{l.current_provider ? ` · τώρα ${l.current_provider}` : ""}{l.savings ? ` · εξοικονόμηση ~${eur(Number(l.savings))}` : ""}</div>
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

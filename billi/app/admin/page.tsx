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

interface Stats {
  days: number;
  funnel: { name: string; sessions: number }[];
  sources: { source: string; sessions: number }[];
  tariffClicks: { tariff: string; clicks: number }[];
}

function StatsView() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    api<Stats>(`/api/admin/stats?days=${days}`).then(setStats).catch((e) => setError(e.message));
  }, [days]);

  const top = stats?.funnel[0]?.sessions || 1;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Από πού έρχονται και τι κάνουν</h2>
        <select className={`${input} w-36`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>7 ημέρες</option>
          <option value={30}>30 ημέρες</option>
          <option value={90}>90 ημέρες</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!stats ? (
        <p className="text-sm text-slate-500">Φόρτωση…</p>
      ) : (
        <>
          <div className={card}>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Πορεία επισκεπτών (μοναδικοί)</div>
            <ol className="mt-3 space-y-2">
              {stats.funnel.map((f, i) => (
                <li key={f.name}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">{EVENT_LABEL[f.name] ?? f.name}</span>
                    <span className="font-semibold text-white">
                      {f.sessions}
                      {i > 0 && stats.funnel[i - 1].sessions > 0 && (
                        <span className="ml-2 text-xs font-normal text-slate-500">{Math.round((f.sessions / stats.funnel[i - 1].sessions) * 100)}%</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-white/5">
                    <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${(f.sessions / top) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={card}>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Πηγές επισκεπτών</div>
              <ul className="mt-2 space-y-1 text-sm">
                {stats.sources.length === 0 && <li className="text-slate-500">Δεν υπάρχουν ακόμα δεδομένα</li>}
                {stats.sources.map((s) => (
                  <li key={s.source} className="flex justify-between"><span className="truncate text-slate-300">{s.source}</span><span className="text-white">{s.sessions}</span></li>
                ))}
              </ul>
            </div>
            <div className={card}>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Προγράμματα που πάτησαν</div>
              <ul className="mt-2 space-y-1 text-sm">
                {stats.tariffClicks.length === 0 && <li className="text-slate-500">Δεν υπάρχουν ακόμα δεδομένα</li>}
                {stats.tariffClicks.map((t) => (
                  <li key={t.tariff} className="flex justify-between gap-2"><span className="truncate text-slate-300">{t.tariff}</span><span className="text-white">{t.clicks}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
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
        <div className="mt-6"><StatsView /></div>
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

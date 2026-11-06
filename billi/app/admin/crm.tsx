"use client";

import { useCallback, useEffect, useState } from "react";
import TASKS_SQL from "@/supabase/migrations/20261106_crm.sql";
import type { Lead, LeadStatus } from "@/lib/db";
import { SqlStep, api, btn, btnGhost, card, eur, input, when } from "./ui";

/* CRM building blocks: temperature badge, today's tasks, pipeline board and the customer 360 panel. */

export interface CrmInfo {
  score: number;
  label: "hot" | "warm" | "cold";
  reasons: string[];
  stalled: boolean;
  last_seen: string | null;
  last_contact: string | null;
  open_tasks: number;
  next_task: Task | null;
}
export type CrmLead = Lead & { crm?: CrmInfo };
export interface Task { id: string; lead_id: string; title: string; due_at: string; done_at?: string | null; created_by?: string | null }

const TEMP = {
  hot: { icon: "🔥", label: "Ζεστός", cls: "bg-orange-500/15 text-orange-200 ring-orange-300/40" },
  warm: { icon: "🌤", label: "Χλιαρός", cls: "bg-amber-300/10 text-amber-100 ring-amber-300/30" },
  cold: { icon: "❄️", label: "Κρύος", cls: "bg-sky-400/10 text-sky-200 ring-sky-300/30" },
} as const;

export function Temperature({ crm, compact }: { crm?: CrmInfo; compact?: boolean }) {
  if (!crm || crm.score === 0) return null;
  const t = TEMP[crm.label];
  return (
    <span title={crm.reasons.join(" · ")} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${t.cls}`}>
      {t.icon} {compact ? crm.score : `${t.label} ${crm.score}`}
    </span>
  );
}

export const Stalled = ({ crm }: { crm?: CrmInfo }) =>
  crm?.stalled ? <span title="Καμία επαφή πάνω από 7 ημέρες" className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-white/15">⏸ παγωμένο</span> : null;

const local = (iso: string) => new Date(iso).toLocaleString("el-GR", { timeZone: "Europe/Athens", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

/* ───────────── today ───────────── */

export function TodayTasks({ tasks, leads, onOpen, onDone }: { tasks: Task[]; leads: CrmLead[]; onOpen: (id: string) => void; onDone: () => void }) {
  const due = tasks.filter((t) => Date.parse(t.due_at) <= endOfToday());
  const hot = leads.filter((l) => l.crm?.label === "hot" && !l.crm.open_tasks).slice(0, 5);
  if (!due.length && !hot.length) return null;
  const done = async (id: string) => { await api(`/api/admin/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ done: true }) }); onDone(); };
  return (
    <section className={`${card} mt-4 space-y-3`}>
      {due.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-white">📋 Σήμερα ({due.length})</div>
          <ul className="mt-2 space-y-1.5">
            {due.map((t) => {
              const l = leads.find((x) => x.id === t.lead_id);
              const late = Date.parse(t.due_at) < Date.now();
              return (
                <li key={t.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/10">
                  <button className="h-6 w-6 shrink-0 rounded-md ring-1 ring-white/30 hover:bg-emerald-400/20" title="Έγινε" onClick={() => done(t.id)} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(t.lead_id)}>
                    <div className="truncate text-sm text-slate-100">{t.title}</div>
                    <div className={`text-[11px] ${late ? "text-red-300" : "text-slate-400"}`}>{local(t.due_at)}{l ? ` · ${l.name}` : ""}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {hot.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-white">🔥 Κάλεσε πρώτα</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {hot.map((l) => (
              <button key={l.id} onClick={() => onOpen(l.id)} className="rounded-xl bg-orange-500/10 px-3 py-1.5 text-left text-xs text-orange-100 ring-1 ring-orange-300/30 hover:bg-orange-500/20">
                <b>{l.name}</b>{l.savings ? ` · ~${eur(Number(l.savings))}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────────── pipeline ───────────── */

export function Pipeline({ leads, stages, labels, onOpen, onMove }: {
  leads: CrmLead[]; stages: LeadStatus[]; labels: Record<LeadStatus, { label: string; cls: string }>;
  onOpen: (id: string) => void; onMove: (id: string, status: LeadStatus) => Promise<void>;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStatus | null>(null);
  return (
    <div className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3">
      {stages.map((s) => {
        const col = leads.filter((l) => l.status === s).sort((a, b) => (b.crm?.score ?? 0) - (a.crm?.score ?? 0));
        const value = col.reduce((n, l) => n + (Number(l.expected_commission) || 0), 0);
        const savings = col.reduce((n, l) => n + (Number(l.savings) || 0), 0);
        return (
          <section key={s}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
            onDrop={async (e) => { e.preventDefault(); setOver(null); if (drag) await onMove(drag, s); setDrag(null); }}
            className={`w-64 shrink-0 snap-start rounded-2xl p-2 ring-1 transition ${over === s ? "bg-cyan-400/10 ring-cyan-300/50" : "bg-white/[0.02] ring-white/10"}`}>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${labels[s].cls}`}>{labels[s].label}</span>
              <span className="text-[11px] text-slate-400">{col.length}</span>
            </div>
            {(value > 0 || savings > 0) && <div className="px-1 pb-2 text-[11px] text-slate-500">{value > 0 ? `προμήθεια ${eur(value)}` : `εξοικονόμηση ${eur(savings)}`}</div>}
            <ul className="space-y-1.5">
              {col.map((l) => (
                <li key={l.id} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}
                  className={`cursor-grab rounded-xl bg-[#0a1028] p-2.5 ring-1 ring-white/10 active:cursor-grabbing ${drag === l.id ? "opacity-50" : ""}`}>
                  <button className="w-full text-left" onClick={() => onOpen(l.id)}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-semibold text-white">{l.name}</span>
                      <Temperature crm={l.crm} compact />
                    </div>
                    <div className="truncate text-[11px] text-slate-400">{l.tariff_label ?? l.requested_service ?? "Γενική επικοινωνία"}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                      {l.savings ? <span className="text-emerald-300">~{eur(Number(l.savings))}/έτος</span> : null}
                      <Stalled crm={l.crm} />
                      {l.crm?.next_task && <span>📌 {local(l.crm.next_task.due_at)}</span>}
                    </div>
                  </button>
                  {/* Phones can't drag: move with a menu. */}
                  <select className="mt-1.5 w-full rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300 ring-1 ring-white/10" value={l.status}
                    onChange={(e) => onMove(l.id, e.target.value as LeadStatus)} aria-label="Μετακίνηση">
                    {stages.map((x) => <option key={x} value={x}>→ {labels[x].label}</option>)}
                  </select>
                </li>
              ))}
              {col.length === 0 && <li className="rounded-xl border border-dashed border-white/10 p-3 text-center text-[11px] text-slate-600">σύρε εδώ</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ───────────── customer 360 ───────────── */

interface Crm360 {
  profile: { provider: string | null; program_name: string | null; monthly_kwh: number | null; contract_end: string | null } | null;
  bills: { period_end: string | null; kwh_total: number | null; total_due: number | null }[];
  tasks: Task[] | null;
  visits: { days: number; last: string | null; analyses: number; viewed: string[] };
  offer: { tariff: { provider: string; name: string; color: string; price_per_kwh_eur: number; fixed_monthly_eur: number }; annual: number; monthly: number; savings: number | null; why: string } | null;
  messages: { text: string; viber: string; whatsapp: string; email: string | null };
  consents: { id: number; created_at: string; purpose: string; granted: boolean; source: string; text_version: string | null; actor: string | null }[] | null;
  campaigns: { status: string; sent_at: string | null; campaigns: { name: string; channel: string } | null }[];
}

const SOURCE: Record<string, string> = { lead_form: "φόρμα του site", unsubscribe_link: "σύνδεσμος διαγραφής", admin: "από το CRM", account: "λογαριασμός" };

export function Customer360({ lead, crm, onChanged }: { lead: Lead; crm?: CrmInfo; onChanged: () => void }) {
  const [d, setD] = useState<Crm360 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Τηλεφώνημα");
  const [due, setDue] = useState(() => { const t = new Date(Date.now() + 86_400_000); t.setHours(11, 0, 0, 0); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [needSql, setNeedSql] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try { setD(await api<Crm360>(`/api/admin/leads/${lead.id}/crm`)); } catch (e: any) { setError(e.message); }
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);

  const addTask = async () => {
    setError(null);
    try {
      await api(`/api/admin/leads/${lead.id}/tasks`, { method: "POST", body: JSON.stringify({ title, due_at: new Date(due).toISOString() }) });
      await load();
      onChanged();
    } catch (e: any) {
      if (e.message === "missing_tasks") setNeedSql(true); else setError(e.message);
    }
  };
  const toggle = async (t: Task) => { await api(`/api/admin/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ done: !t.done_at }) }); await load(); onChanged(); };

  return (
    <div className="space-y-4">
      {crm && crm.score > 0 && (
        <div className={`${card} space-y-1.5`}>
          <div className="flex items-center gap-2"><Temperature crm={crm} /><Stalled crm={crm} /></div>
          <ul className="text-xs text-slate-300">{crm.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
          {crm.last_contact && <div className="text-[11px] text-slate-500">Τελευταία επαφή {when(crm.last_contact)}</div>}
        </div>
      )}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {!d ? <p className="text-xs text-slate-500">Φόρτωση 360°…</p> : (
        <>
          <div className={`${card} space-y-2`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">💡 Επόμενη καλύτερη προσφορά</div>
            {d.offer ? (
              <>
                <div className="text-sm font-semibold text-white">{d.offer.tariff.provider} · {d.offer.tariff.name}</div>
                <div className="text-xs text-slate-400">~{eur(d.offer.monthly)}/μήνα · ~{eur(d.offer.annual)}/έτος{d.offer.savings && d.offer.savings > 0 ? <> · <span className="text-emerald-300">−{eur(d.offer.savings)}/έτος</span></> : null}</div>
                <div className="text-[11px] text-slate-500">{d.offer.why} Εκτίμηση με επιβεβαιωμένες τιμές.</div>
              </>
            ) : <div className="text-xs text-slate-400">Δεν υπάρχουν αρκετά στοιχεία κατανάλωσης. Ζήτα του λογαριασμό.</div>}
            <textarea className={`${input} min-h-[90px] text-xs`} readOnly value={d.messages.text} />
            <div className="flex flex-wrap gap-2">
              <a className={btn + " !px-3 !py-1.5 text-xs"} href={d.messages.viber}>💜 Viber</a>
              <a className={btnGhost + " !px-3 !py-1.5 text-xs"} href={d.messages.whatsapp} target="_blank" rel="noreferrer">💬 WhatsApp</a>
              {d.messages.email && <a className={btnGhost + " !px-3 !py-1.5 text-xs"} href={d.messages.email}>✉️ Email</a>}
              <button className={btnGhost + " !px-3 !py-1.5 text-xs"} onClick={() => navigator.clipboard?.writeText(d.messages.text).then(() => setCopied(true))}>{copied ? "✓ Αντιγράφηκε" : "📋 Αντιγραφή"}</button>
            </div>
          </div>

          <div className={`${card} space-y-2`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">📌 Εργασίες</div>
            {needSql ? <SqlStep title="Ενεργοποίηση εργασιών" text="Για εργασίες και υπενθυμίσεις χρειάζεται μία φορά αυτό το SQL." sql={TASKS_SQL} onRetry={() => { setNeedSql(false); addTask(); }} /> : (
              <>
                {(d.tasks ?? []).length === 0 && <p className="text-xs text-slate-500">Καμία εργασία.</p>}
                <ul className="space-y-1">
                  {(d.tasks ?? []).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={!!t.done_at} onChange={() => toggle(t)} />
                      <span className={t.done_at ? "text-slate-500 line-through" : "text-slate-100"}>{t.title}</span>
                      <span className={`ml-auto text-[11px] ${!t.done_at && Date.parse(t.due_at) < Date.now() ? "text-red-300" : "text-slate-500"}`}>{local(t.due_at)}</span>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-[1fr_auto] gap-2 pt-1 sm:grid-cols-[1fr_auto_auto]">
                  <select className={input} value={title} onChange={(e) => setTitle(e.target.value)}>
                    {["Τηλεφώνημα", "Αποστολή προσφοράς", "Follow-up μετά την προσφορά", "Ζήτα λογαριασμό", "Έλεγχος υπογραφής", "Υπενθύμιση λήξης σύμβασης"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <input type="datetime-local" className={`${input} col-span-2 sm:col-span-1`} value={due} onChange={(e) => setDue(e.target.value)} />
                  <button className={btn + " col-span-2 sm:col-span-1"} onClick={addTask}>＋ Εργασία</button>
                </div>
              </>
            )}
          </div>

          <div className={`${card} space-y-2`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">🔐 Συγκαταθέσεις</div>
              <button className={btnGhost + " !px-3 !py-1 text-[11px]"} onClick={async () => {
                const to = !lead.consent_marketing;
                if (!confirm(to ? "Ο πελάτης ζήτησε να λαμβάνει προσφορές; Η αλλαγή καταγράφεται με το όνομά σου." : "Ανάκληση της συγκατάθεσης για προσφορές;")) return;
                await api(`/api/admin/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ consent_marketing: to }) });
                onChanged();
                load();
              }}>{lead.consent_marketing ? "Ανάκληση προσφορών" : "Ενεργοποίηση προσφορών"}</button>
            </div>
            <div className="text-sm text-slate-200">Επικοινωνία ✓ · Προσφορές {lead.consent_marketing ? "✓" : "✕"}</div>
            {d.consents && d.consents.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-slate-500">
                {d.consents.map((c) => <li key={c.id}>{when(c.created_at)} · {c.purpose === "marketing" ? "Προσφορές" : "Επικοινωνία"} {c.granted ? "✓" : "✕"} · {SOURCE[c.source] ?? c.source}{c.actor ? ` (${c.actor})` : ""}{c.text_version ? ` · κείμενο ${c.text_version}` : ""}</li>)}
              </ul>
            )}
            {d.campaigns.length > 0 && <div className="text-[11px] text-slate-500">Καμπάνιες: {d.campaigns.map((c) => `${c.campaigns?.name ?? "—"} (${c.status === "sent" ? "στάλθηκε" : c.status})`).join(" · ")}</div>}
          </div>

          <div className={`${card} grid grid-cols-2 gap-x-4 gap-y-1 text-sm`}>
            <div className="col-span-2 text-xs font-semibold uppercase tracking-wider text-slate-500">👤 360°</div>
            <span className="text-slate-500">Λογαριασμός Billi</span><span>{lead.user_id ? "Ναι" : "Όχι"}</span>
            {d.profile && <><span className="text-slate-500">Προφίλ</span><span>{[d.profile.provider, d.profile.program_name].filter(Boolean).join(" ") || "—"}{d.profile.monthly_kwh ? ` · ${Math.round(d.profile.monthly_kwh)} kWh/μήνα` : ""}</span></>}
            {d.profile?.contract_end && <><span className="text-slate-500">Λήξη σύμβασης</span><span>{d.profile.contract_end.split("-").reverse().join("/")}</span></>}
            {d.bills.length > 0 && <><span className="text-slate-500">Λογαριασμοί</span><span>{d.bills.length} αποθηκευμένοι · τελευταίος {eur(Number(d.bills[0].total_due))}</span></>}
            <span className="text-slate-500">Επισκέψεις</span><span>{d.visits.days ? `${d.visits.days} ημέρες · τελευταία ${when(d.visits.last!)}` : "— (χωρίς συγκατάθεση στατιστικών ή χωρίς επισκέψεις)"}</span>
            {d.visits.analyses > 0 && <><span className="text-slate-500">Αναλύσεις</span><span>{d.visits.analyses}</span></>}
          </div>
        </>
      )}
    </div>
  );
}

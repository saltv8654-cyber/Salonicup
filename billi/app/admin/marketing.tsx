"use client";

import { useCallback, useEffect, useState } from "react";
import MARKETING_SQL from "@/supabase/migrations/20261106_marketing.sql";
import { SqlStep, api, btn, btnGhost, card, eur, input, when } from "./ui";
import { Temperature, type CrmInfo } from "./crm";

/* Targeted offers: segments → campaign → results, plus which sources bring signatures. Consent-only. */

interface SegmentRow { key: string; icon: string; label: string; description: string; count: number; consented: number; email: number; phone: number }
interface Campaign { id: string; created_at: string; created_by: string; name: string; segment: string; channel: Channel; recipients: number; sent: number; pending: number; responded: number; signed: number }
interface SourceRow { source: string; leads: number; signed: number; commission: number; savings: number }
interface Overview { ready: boolean; mail: boolean; segments: SegmentRow[]; campaigns: Campaign[]; sources: SourceRow[]; consent: { total: number; marketing: number } }
type Channel = "email" | "viber" | "whatsapp";
interface Member { id: string; name: string; status: string; crm: CrmInfo; savings: number | null; consent_marketing: boolean; reachable: boolean; email: boolean; offer: { name: string; monthly: number; savings: number | null } | null; message: string }

const CHANNEL: Record<Channel, string> = { viber: "💜 Viber", whatsapp: "💬 WhatsApp", email: "✉️ Email" };
const small = " !px-3 !py-1.5 text-xs";
const DEFAULT =
  "Γεια σας! Είμαι {διαχειριστής} από το Billi. Με τις νέες τιμές του μήνα, για την κατανάλωσή σας το {πρόγραμμα} βγαίνει ~{κόστος}/μήνα{εξοικονόμηση}. Θέλετε να το δούμε μαζί; Η αλλαγή γίνεται χωρίς διακοπή ρεύματος.";

export function MarketingView() {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState<SegmentRow | null>(null);
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setO(await api<Overview>("/api/admin/marketing")); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>;
  if (!o) return <p className="text-sm text-slate-500">Φόρτωση…</p>;
  if (!o.ready) return <SqlStep title="Ενεργοποίηση στοχευμένων προσφορών" text="Για συγκαταθέσεις και καμπάνιες χρειάζεται μία φορά αυτό το SQL." sql={MARKETING_SQL} onRetry={load} />;
  const rate = o.consent.total ? Math.round((o.consent.marketing / o.consent.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">🎯 Στοχευμένες προσφορές</h2>
        <p className="text-xs text-slate-400">
          Μόνο σε όσους συμφώνησαν να λαμβάνουν προσφορές: <b className="text-slate-200">{o.consent.marketing}</b> από {o.consent.total} πελάτες ({rate}%).
          Κάθε μήνυμα έχει τη δική του πρόταση με τις επιβεβαιωμένες τιμές.
        </p>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">Τμήματα πελατών</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {o.segments.map((s) => (
            <button key={s.key} onClick={() => setBuilding(s)} disabled={!s.count}
              className={`${card} text-left transition hover:ring-cyan-300/40 disabled:opacity-50`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-white">{s.icon} {s.label}</div>
                <span className="text-xl font-bold text-white">{s.count}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{s.description}</div>
              <div className="mt-2 text-[11px] text-slate-500">με συγκατάθεση {s.consented} · τηλ. {s.phone} · email {s.email}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">Καμπάνιες</h3>
        {o.campaigns.length === 0 ? <p className={`${card} text-sm text-slate-400`}>Καμία καμπάνια ακόμα. Διάλεξε ένα τμήμα για να ξεκινήσεις.</p> : (
          <ul className="space-y-1.5">
            {o.campaigns.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpenCampaign(c.id)} className={`${card} w-full !p-3 text-left hover:ring-white/25`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-white">{c.name}</span>
                    <span className="text-xs text-slate-400">{CHANNEL[c.channel]} · {when(c.created_at)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>παραλήπτες <b className="text-slate-200">{c.recipients}</b></span>
                    <span>στάλθηκαν <b className="text-slate-200">{c.sent}</b>{c.pending ? ` · εκκρεμούν ${c.pending}` : ""}</span>
                    <span>προχώρησαν <b className="text-cyan-200">{c.responded}</b></span>
                    <span>υπέγραψαν <b className="text-emerald-300">{c.signed}</b></span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">Από πού έρχονται οι υπογραφές</h3>
        <div className="overflow-x-auto rounded-2xl ring-1 ring-white/10">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wider text-slate-400">
              <tr><th className="px-3 py-2 text-left">Πηγή</th><th className="px-3 py-2 text-right">Αιτήματα</th><th className="px-3 py-2 text-right">Υπογραφές</th><th className="px-3 py-2 text-right">Μετατροπή</th><th className="px-3 py-2 text-right">Προμήθεια</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {o.sources.map((s) => (
                <tr key={s.source}>
                  <td className="px-3 py-2 text-slate-100">{s.source}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{s.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{s.signed}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{s.leads ? Math.round((s.signed / s.leads) * 100) : 0}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{eur(s.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {building && <CampaignBuilder seg={building} mail={o.mail} onClose={() => setBuilding(null)} onCreated={(id) => { setBuilding(null); load(); setOpenCampaign(id); }} />}
      {openCampaign && <CampaignSend id={openCampaign} onClose={() => { setOpenCampaign(null); load(); }} />}
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        <div className="mt-4 space-y-3">{children}</div>
      </aside>
    </div>
  );
}

function CampaignBuilder({ seg, mail, onClose, onCreated }: { seg: SegmentRow; mail: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const month = new Date().toLocaleDateString("el-GR", { month: "long", year: "numeric" });
  const [channel, setChannel] = useState<Channel>("viber");
  const [name, setName] = useState(`${seg.label} · ${month}`);
  const [subject, setSubject] = useState("Μια πιο συμφέρουσα πρόταση για το ρεύμα σας");
  const [message, setMessage] = useState(DEFAULT);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useCallback(async () => {
    setMembers(null);
    try {
      const d = await api<{ members: Member[] }>(`/api/admin/marketing?segment=${seg.key}&channel=${channel}&message=${encodeURIComponent(message)}`);
      setMembers(d.members);
    } catch (e: any) { setError(e.message); }
  }, [seg.key, channel, message]);
  useEffect(() => { preview(); }, [seg.key, channel]); // eslint-disable-line react-hooks/exhaustive-deps

  const reachable = (members ?? []).filter((m) => m.reachable && !excluded.has(m.id));
  const create = async () => {
    if (!confirm(channel === "email" ? `Αποστολή email σε ${reachable.length} πελάτες τώρα;` : `Δημιουργία λίστας με ${reachable.length} μηνύματα για ${CHANNEL[channel]};`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ campaign: { id: string } }>("/api/admin/marketing", { method: "POST", body: JSON.stringify({ name, segment: seg.key, channel, subject, message, exclude: [...excluded] }) });
      onCreated(r.campaign.id);
    } catch (e: any) {
      setError(e.message === "missing_marketing" ? "Τρέξε πρώτα το SQL των προσφορών." : e.message);
    } finally { setBusy(false); }
  };

  return (
    <Drawer title={`${seg.icon} ${seg.label}`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
        {(Object.keys(CHANNEL) as Channel[]).map((c) => (
          <button key={c} disabled={c === "email" && !mail} title={c === "email" && !mail ? "Χρειάζεται Resend" : ""}
            className={`rounded-lg py-2 text-xs font-semibold disabled:opacity-40 ${channel === c ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white" : "text-slate-300"}`} onClick={() => setChannel(c)}>{CHANNEL[c]}</button>
        ))}
      </div>
      {!mail && <p className="text-[11px] text-slate-500">Το email ενεργοποιείται με το Resend. Viber και WhatsApp στέλνονται από το κινητό σου, ένα ένα, με έτοιμο μήνυμα.</p>}
      <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Όνομα καμπάνιας" />
      {channel === "email" && <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Θέμα email" />}
      <textarea className={`${input} min-h-[120px]`} value={message} onChange={(e) => setMessage(e.target.value)} />
      <p className="text-[11px] text-slate-500">Αυτόματα για τον καθένα: {"{πρόγραμμα}"} {"{κόστος}"} {"{εξοικονόμηση}"} {"{πάροχος}"} {"{διαχειριστής}"}</p>
      <button className={btnGhost + small} onClick={preview}>↻ Προεπισκόπηση</button>

      {!members ? <p className="text-xs text-slate-500">Φόρτωση…</p> : (
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li key={m.id} className={`rounded-xl p-2.5 ring-1 ${m.reachable && !excluded.has(m.id) ? "bg-white/[0.03] ring-white/10" : "bg-white/[0.01] opacity-60 ring-white/5"}`}>
              <div className="flex items-center gap-2">
                {m.reachable && <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={!excluded.has(m.id)} onChange={() => setExcluded((x) => { const n = new Set(x); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} />}
                <span className="text-sm font-semibold text-white">{m.name}</span>
                <Temperature crm={m.crm} compact />
                <span className="ml-auto text-[11px] text-slate-500">{!m.consent_marketing ? "χωρίς συγκατάθεση" : !m.reachable ? "χωρίς email" : m.offer ? `${m.offer.name}` : "χωρίς στοιχεία κατανάλωσης"}</span>
              </div>
              {m.reachable && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{m.message}</p>}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      <div className="sticky bottom-0 -mx-5 border-t border-white/10 bg-[#060a1c] px-5 py-3">
        <button className={`${btn} w-full`} disabled={busy || !reachable.length} onClick={create}>
          {busy ? "…" : channel === "email" ? `✉️ Αποστολή σε ${reachable.length}` : `Δημιουργία λίστας (${reachable.length})`}
        </button>
      </div>
    </Drawer>
  );
}

interface Recipient { lead_id: string; status: string; message: string; sent_at: string | null; viber: string; whatsapp: string; leads: { name: string; phone: string; email: string | null; status: string } | null }

function CampaignSend({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<{ campaign: { name: string; channel: Channel }; recipients: Recipient[] } | null>(null);
  const load = useCallback(async () => setD(await api(`/api/admin/campaigns/${id}`)), [id]);
  useEffect(() => { load(); }, [load]);
  const mark = async (lead: string, status: "sent" | "skipped" | "pending") => {
    await api(`/api/admin/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ lead_id: lead, status }) });
    load();
  };
  if (!d) return <Drawer title="…" onClose={onClose}><p className="text-xs text-slate-500">Φόρτωση…</p></Drawer>;
  const manual = d.campaign.channel !== "email";
  return (
    <Drawer title={d.campaign.name} onClose={onClose}>
      {manual && <p className="text-xs text-slate-400">Πάτα «Άνοιγμα» για κάθε πελάτη: ανοίγει το {CHANNEL[d.campaign.channel]} με το μήνυμα έτοιμο. Μετά την αποστολή σημειώνεται αυτόματα.</p>}
      <ul className="space-y-1.5">
        {d.recipients.map((r) => (
          <li key={r.lead_id} className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">{r.leads?.name}</span>
              <span className={`text-[11px] ${r.status === "sent" ? "text-emerald-300" : r.status === "failed" ? "text-red-300" : "text-slate-500"}`}>
                {r.status === "sent" ? `✓ στάλθηκε ${r.sent_at ? when(r.sent_at) : ""}` : r.status === "failed" ? "✕ απέτυχε" : r.status === "skipped" ? "παραλείφθηκε" : "εκκρεμεί"}
              </span>
              {manual && r.status !== "sent" && (
                <span className="ml-auto flex gap-1.5">
                  <a className={btn + small} href={d.campaign.channel === "viber" ? r.viber : r.whatsapp} target={d.campaign.channel === "whatsapp" ? "_blank" : undefined} rel="noreferrer" onClick={() => mark(r.lead_id, "sent")}>Άνοιγμα</a>
                  {r.status !== "skipped" && <button className={btnGhost + small} onClick={() => mark(r.lead_id, "skipped")}>Παράλειψη</button>}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{r.message}</p>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

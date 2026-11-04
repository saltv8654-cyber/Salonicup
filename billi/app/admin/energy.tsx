"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MIGRATION_SQL from "@/supabase/migrations/20261104_energy_data.sql";
import SITE_SQL from "@/supabase/migrations/20261106_site_sources.sql";
import { FIELD_LABEL, SOURCE_FLAG_CODES, type Flag, type Provider, type QueueItem, type RunLog, type Source, type TariffValues } from "@/lib/energy/model";
import { validateValues } from "@/lib/energy/validate";
import { L, SqlStep, api, btn, btnGhost, card, input, when } from "./ui";

/* ───────────── shared bits ───────────── */

const COLOR_WORD: Record<string, string> = { blue: "🔵 Μπλε", green: "🟢 Πράσινο", yellow: "🟡 Κίτρινο", orange: "🟠 Πορτοκαλί" };
const small = " !px-3 !py-1.5 text-xs";

/** Review colours: green new, yellow price change, red discontinued, grey awaiting verification. */
const CHANGE: Record<QueueItem["change_type"], { label: string; dot: string; cls: string }> = {
  new: { label: "Νέο πρόγραμμα", dot: "bg-emerald-400", cls: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/40" },
  price_change: { label: "Αλλαγή τιμής", dot: "bg-amber-300", cls: "bg-amber-300/15 text-amber-100 ring-amber-300/40" },
  details_change: { label: "Αλλαγή όρων", dot: "bg-amber-300", cls: "bg-amber-300/15 text-amber-100 ring-amber-300/40" },
  discontinued: { label: "Καταργήθηκε", dot: "bg-red-400", cls: "bg-red-500/15 text-red-200 ring-red-400/40" },
};
const AWAITING = "bg-slate-400/15 text-slate-300 ring-slate-400/40";
const STATUS_LABEL: Record<QueueItem["status"], string> = { pending: "Εκκρεμεί έγκριση", approved: "Εγκρίθηκε", rejected: "Απορρίφθηκε", superseded: "Αντικαταστάθηκε" };

const p4 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toFixed(4));
const pct = (a: number | null | undefined, b: number | null | undefined) => {
  if (a === null || a === undefined || b === null || b === undefined || Number(a) === 0) return null;
  return (Number(b) - Number(a)) / Number(a);
};
const ago = (iso: string | null) => {
  if (!iso) return "ποτέ";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `πριν ${Math.max(m, 0)}′`;
  if (m < 48 * 60) return `πριν ${Math.round(m / 60)} ώρες`;
  return `πριν ${Math.round(m / 1440)} ημέρες`;
};

function Chip({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>{children}</span>;
}

function StatusChip({ item }: { item: Pick<QueueItem, "status" | "flags" | "change_type"> }) {
  if (item.status === "pending" && (item.flags ?? []).length > 0) return <Chip cls={AWAITING}>⏳ Θέλει επαλήθευση</Chip>;
  if (item.status === "pending") return <Chip cls={CHANGE[item.change_type].cls}>Εκκρεμεί</Chip>;
  if (item.status === "approved") return <Chip cls="bg-emerald-500/20 text-emerald-100 ring-emerald-300/40">✓ Εγκρίθηκε</Chip>;
  if (item.status === "rejected") return <Chip cls="bg-white/5 text-slate-400 ring-white/15">✕ Απορρίφθηκε</Chip>;
  return <Chip cls="bg-white/5 text-slate-500 ring-white/10">Αντικαταστάθηκε</Chip>;
}

function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <p className="text-xs text-emerald-300">✓ Κανένα πρόβλημα στον αυτόματο έλεγχο</p>;
  return (
    <ul className="space-y-1">
      {flags.map((f, i) => (
        <li key={`${f.code}-${i}`} className={`rounded-lg px-2.5 py-1.5 text-xs ring-1 ${f.level === "error" ? "bg-red-500/10 text-red-200 ring-red-400/30" : "bg-amber-400/10 text-amber-100 ring-amber-300/30"}`}>
          {f.level === "error" ? "⛔" : "⚠️"} {f.message}
        </li>
      ))}
    </ul>
  );
}

async function openDocument(path: string) {
  const w = window.open("about:blank", "_blank");
  try {
    const { url } = await api<{ url: string }>(`/api/admin/energy/document?path=${encodeURIComponent(path)}`);
    if (w) w.location.href = url;
  } catch (e: any) {
    w?.close();
    alert(e.message);
  }
}

/* ───────────── overview ───────────── */

interface Overview {
  kpis: {
    providers: number; active_programs: number; new_programs: number; price_changes: number; discontinued: number; pending: number;
    flagged: number; failed_sources: number; failed_runs_7d: number; last_success_at: string | null; sources: number;
    unverified_programs: number; expired_programs: number;
  };
  setup: { cron_secret: boolean; anthropic_key: boolean; telegram: boolean };
  stale_days: number;
}

function Kpi({ label, value, hint, tone, onClick }: { label: string; value: React.ReactNode; hint?: string; tone?: "good" | "warn" | "bad"; onClick?: () => void }) {
  const ring = tone === "bad" ? "ring-red-400/40" : tone === "warn" ? "ring-amber-300/40" : tone === "good" ? "ring-emerald-300/30" : "ring-white/10";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`rounded-2xl bg-white/[0.03] p-3 text-left ring-1 ${ring} ${onClick ? "transition hover:bg-white/[0.06]" : ""}`}>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-bold text-white">{value}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </Tag>
  );
}

type Tab = "review" | "sources" | "providers" | "history" | "logs";

export function EnergyView() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [queueFilter, setQueueFilter] = useState<string>("pending");
  const [logFilter, setLogFilter] = useState<"runs" | "failed" | "activity">("runs");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOv(await api<Overview>("/api/admin/energy/overview"));
      setMissing(false);
    } catch (e: any) {
      if (e.message === "missing_migration") setMissing(true);
      else setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  const refresh = () => setTick((t) => t + 1);

  if (missing) {
    return (
      <SqlStep
        title="Ενεργοποίηση: Διαχείριση δεδομένων ενέργειας"
        text="Για τη συλλογή τιμών, την ουρά έγκρισης και το ιστορικό χρειάζονται νέοι πίνακες (μία φορά). Δεν αλλάζει τίποτα στο site μέχρι να εγκρίνεις αλλαγές."
        sql={MIGRATION_SQL}
        onRetry={load}
      />
    );
  }
  if (error) return <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>;
  if (!ov) return <p className="text-sm text-slate-500">Φόρτωση…</p>;
  const k = ov.kpis;
  const go = (t: Tab, f?: string) => { setTab(t); if (f && t === "review") setQueueFilter(f); if (f && t === "logs") setLogFilter(f as typeof logFilter); };

  const tabs: { v: Tab; l: string }[] = [
    { v: "review", l: `🗂 Έλεγχος αλλαγών${k.pending ? ` (${k.pending})` : ""}` },
    { v: "sources", l: "🌐 Πηγές" },
    { v: "providers", l: "🏢 Πάροχοι" },
    { v: "history", l: "📈 Ιστορικό τιμών" },
    { v: "logs", l: "🧾 Καταγραφή" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">⚡ Διαχείριση δεδομένων ενέργειας</h2>
        <p className="text-xs text-slate-400">
          Το Billi ελέγχει τις πηγές, βρίσκει αλλαγές και τις βάζει σε αναμονή. Στο site περνάει μόνο ό,τι εγκρίνεις εδώ.
        </p>
      </div>

      {(!ov.setup.anthropic_key || !ov.setup.cron_secret) && (
        <div className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-amber-300/30">
          {!ov.setup.anthropic_key && <p>⚠️ Λείπει το <b>ANTHROPIC_API_KEY</b> στο Vercel: χωρίς αυτό δεν γίνεται ανάγνωση των πηγών.</p>}
          {!ov.setup.cron_secret && <p>⚠️ Λείπει το <b>CRON_SECRET</b> στο Vercel: ο αυτόματος ημερήσιος έλεγχος δεν θα τρέχει (ο χειροκίνητος δουλεύει).</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Πάροχοι" value={k.providers} hint={`${k.sources} ενεργές πηγές`} onClick={() => go("providers")} />
        <Kpi label="Ενεργά προγράμματα" value={k.active_programs} hint={k.unverified_programs ? `${k.unverified_programs} χωρίς πρόσφατη επιβεβαίωση` : "όλα επιβεβαιωμένα"} tone={k.unverified_programs ? "warn" : "good"} onClick={() => go("history")} />
        <Kpi label="Νέα προγράμματα" value={k.new_programs} tone={k.new_programs ? "good" : undefined} onClick={() => go("review", "pending")} />
        <Kpi label="Αλλαγές τιμών" value={k.price_changes} tone={k.price_changes ? "warn" : undefined} onClick={() => go("review", "pending")} />
        <Kpi label="Περιμένουν έγκριση" value={k.pending} hint={k.flagged ? `${k.flagged} θέλουν επαλήθευση` : undefined} tone={k.pending ? "warn" : undefined} onClick={() => go("review", "pending")} />
        <Kpi label="Καταργήσεις" value={k.discontinued} tone={k.discontinued ? "bad" : undefined} onClick={() => go("review", "pending")} />
        <Kpi label="Αποτυχίες συλλογής" value={k.failed_sources} hint={`${k.failed_runs_7d} τις τελευταίες 7 ημέρες`} tone={k.failed_sources ? "bad" : "good"} onClick={() => go("logs", "failed")} />
        <Kpi label="Τελευταίος επιτυχής συγχρονισμός" value={<span className="text-base">{k.last_success_at ? ago(k.last_success_at) : "—"}</span>} hint={k.last_success_at ? when(k.last_success_at) : "δεν έχει γίνει ακόμα"} onClick={() => go("logs", "runs")} />
      </div>
      {k.expired_programs > 0 && (
        <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200 ring-1 ring-red-400/30">
          ⛔ {k.expired_programs} ενεργά προγράμματα έχουν ληγμένη ισχύ. Στο site φαίνονται με προειδοποίηση και δεν προτείνονται.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => <button key={t.v} className={(tab === t.v ? btn : btnGhost) + small} onClick={() => setTab(t.v)}>{t.l}</button>)}
      </div>

      {tab === "review" && <ReviewQueue filter={queueFilter} setFilter={setQueueFilter} onChanged={refresh} />}
      {tab === "sources" && <SourcesView onChanged={refresh} />}
      {tab === "providers" && <ProvidersView />}
      {tab === "history" && <HistoryView />}
      {tab === "logs" && <LogsView kind={logFilter} setKind={setLogFilter} />}
    </div>
  );
}

/* ───────────── review queue ───────────── */

function ReviewQueue({ filter, setFilter, onChanged }: { filter: string; setFilter: (f: string) => void; onChanged: () => void }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [type, setType] = useState<string>("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: QueueItem[] }>(`/api/admin/energy/queue?status=${filter}`)).items);
    } catch (e: any) {
      setError(e.message);
      setItems([]);
    }
  }, [filter]);
  useEffect(() => { setItems(null); load(); }, [load]);

  const shown = useMemo(() => (items ?? []).filter((i) => type === "all" || (type === "flagged" ? i.flags.length > 0 : type === "price_change" ? i.change_type === "price_change" || i.change_type === "details_change" : i.change_type === type)), [items, type]);
  const cleanCount = (items ?? []).filter((i) => i.status === "pending" && i.flags.length === 0 && i.change_type !== "discontinued").length;

  const bulk = async () => {
    if (!confirm(`Έγκριση ${cleanCount} νέων/αλλαγμένων προγραμμάτων χωρίς καμία επισήμανση; Θα εμφανιστούν αμέσως στο site. (Οι καταργήσεις εγκρίνονται μία μία.)`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ approved: number; failed: { error: string }[] }>("/api/admin/energy/queue/bulk", { method: "POST", body: "{}" });
      setMsg(`Εγκρίθηκαν ${r.approved}${r.failed.length ? ` · ${r.failed.length} απέτυχαν: ${r.failed[0].error}` : ""}`);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-end gap-2`}>
        <L t="Κατάσταση">
          <select className={`${input} w-44`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">Εκκρεμούν</option><option value="approved">Εγκρίθηκαν</option><option value="rejected">Απορρίφθηκαν</option>
            <option value="superseded">Αντικαταστάθηκαν</option><option value="all">Όλες</option>
          </select>
        </L>
        <L t="Είδος">
          <select className={`${input} w-48`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Όλα</option><option value="new">🟢 Νέα προγράμματα</option><option value="price_change">🟡 Αλλαγές τιμών/όρων</option>
            <option value="discontinued">🔴 Καταργήσεις</option><option value="flagged">⚪ Θέλουν επαλήθευση</option>
          </select>
        </L>
        {filter === "pending" && cleanCount > 0 && (
          <button className={btnGhost + small} disabled={busy} onClick={bulk}>✓ Έγκριση όσων δεν έχουν επισημάνσεις ({cleanCount})</button>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Νέο πρόγραμμα</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-300" /> Αλλαγή τιμής</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-400" /> Καταργήθηκε</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Θέλει επαλήθευση</span>
      </div>
      {msg && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">✓ {msg}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}

      {!items ? (
        <p className="text-sm text-slate-500">Φόρτωση…</p>
      ) : shown.length === 0 ? (
        <p className={`${card} text-sm text-slate-400`}>{filter === "pending" ? "Καμία αλλαγή δεν περιμένει έγκριση. Πάτα «Έλεγχος τώρα» στις Πηγές για νέο έλεγχο." : "Καμία εγγραφή."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Πάροχος</th><th className="px-3 py-2">Πρόγραμμα</th>
                <th className="px-3 py-2 text-right">Παλιά τιμή</th><th className="px-3 py-2 text-right">Νέα τιμή</th>
                <th className="px-3 py-2">Αλλαγή</th><th className="px-3 py-2">Κατάσταση</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((i) => {
                const oldP = i.old_values?.price_per_kwh_eur;
                const newP = i.new_values?.price_per_kwh_eur;
                const d = pct(oldP, newP);
                const flagged = i.status === "pending" && i.flags.length > 0;
                return (
                  <tr key={i.id} className="cursor-pointer bg-white/[0.01] hover:bg-white/[0.05]" onClick={() => setOpen(i.id)}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${flagged ? "bg-slate-400" : CHANGE[i.change_type].dot}`} />
                        <span className="text-slate-100">{i.provider}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-200">{i.program}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{p4(oldP)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{i.change_type === "discontinued" ? "—" : p4(newP)}</td>
                    <td className="px-3 py-2.5">
                      <Chip cls={CHANGE[i.change_type].cls}>{CHANGE[i.change_type].label}{d !== null && d !== 0 ? ` ${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}%` : ""}</Chip>
                    </td>
                    <td className="px-3 py-2.5"><StatusChip item={i} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && <ReviewDrawer id={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); onChanged(); }} />}
    </div>
  );
}

/* editable form of TariffValues */
type Form = Record<keyof TariffValues, string> & { day_night_b: boolean };
const NUM_FIELDS = ["fixed_monthly_eur", "price_per_kwh_eur", "price_per_kwh_night_eur", "price_per_kwh_with_discount_eur", "min_duration_months"] as const;
const toForm = (v: TariffValues): Form => {
  const f = {} as Form;
  for (const k of Object.keys(FIELD_LABEL) as (keyof TariffValues)[]) f[k] = v[k] === null || v[k] === undefined ? "" : String(v[k]);
  f.day_night_b = v.day_night;
  return f;
};
const fromForm = (f: Form): TariffValues => {
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const t = (s: string) => (s.trim() ? s.trim() : null);
  return {
    provider: f.provider.trim(), name: f.name.trim(), color: (t(f.color) as TariffValues["color"]) ?? null,
    segment: f.segment === "business" ? "business" : "residential",
    fixed_monthly_eur: n(f.fixed_monthly_eur), price_per_kwh_eur: n(f.price_per_kwh_eur), day_night: f.day_night_b,
    price_per_kwh_night_eur: n(f.price_per_kwh_night_eur), price_per_kwh_with_discount_eur: n(f.price_per_kwh_with_discount_eur),
    discount_condition: t(f.discount_condition), promo_discount: t(f.promo_discount), min_duration_months: n(f.min_duration_months),
    early_termination_fee: t(f.early_termination_fee), conditions: t(f.conditions), valid_from: t(f.valid_from), valid_until: t(f.valid_until),
    valid_month: t(f.valid_month), url: t(f.url),
  };
};
const show = (k: keyof TariffValues, v: TariffValues | null) => {
  if (!v) return "—";
  const x = v[k];
  if (x === null || x === undefined || x === "") return "—";
  if (k === "color") return COLOR_WORD[String(x)] ?? String(x);
  if (k === "day_night") return x ? "Ναι" : "Όχι";
  if (k === "segment") return x === "business" ? "Επαγγελματικό" : "Οικιακό";
  if ((NUM_FIELDS as readonly string[]).includes(k)) return k === "min_duration_months" ? String(x) : Number(x).toFixed(k === "fixed_monthly_eur" ? 2 : 4);
  return String(x);
};

const FORM_ORDER: (keyof TariffValues)[] = [
  "provider", "name", "color", "segment", "price_per_kwh_eur", "fixed_monthly_eur", "day_night", "price_per_kwh_night_eur",
  "price_per_kwh_with_discount_eur", "discount_condition", "promo_discount", "min_duration_months", "early_termination_fee",
  "conditions", "valid_from", "valid_until", "valid_month", "url",
];

interface HistoryRow { id: number; changed_at: string; change: string; price_per_kwh_eur: string | number | null; fixed_monthly_eur: string | number | null; changed_by: string | null; active: boolean | null; color: string | null; source_url: string | null; valid_month: string | null }

function ReviewDrawer({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [item, setItem] = useState<QueueItem | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ item: QueueItem; history: HistoryRow[] }>(`/api/admin/energy/queue/${id}`)
      .then((d) => {
        setItem(d.item);
        setHistory(d.history);
        setForm(d.item.new_values ? toForm(d.item.new_values) : null);
        setNotes(d.item.notes ?? "");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const values = form ? fromForm(form) : null;
  const liveFlags = useMemo(() => {
    if (!item) return [];
    const kept = item.flags.filter((f) => !values || SOURCE_FLAG_CODES.includes(f.code));
    return values ? [...validateValues(values, item.old_values), ...kept] : kept;
  }, [item, values]);
  const pending = item?.status === "pending";
  const blocking = liveFlags.some((f) => f.level === "error");
  const set = (k: keyof Form, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const act = async (action: "approve" | "reject" | "save") => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      if (action === "save") {
        const d = await api<{ item: QueueItem }>(`/api/admin/energy/queue/${id}`, { method: "PUT", body: JSON.stringify({ values, notes }) });
        setItem(d.item);
        setMsg("Αποθηκεύτηκε (παραμένει σε αναμονή)");
      } else {
        if (action === "approve" && !confirm(item?.change_type === "discontinued" ? "Να κρυφτεί το πρόγραμμα από το site;" : "Δημοσίευση στο site;")) return;
        await api(`/api/admin/energy/queue/${id}`, { method: "POST", body: JSON.stringify({ action, values: item?.change_type === "discontinued" ? undefined : values, notes }) });
        onDone();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-3xl overflow-y-auto bg-[#060a1c] p-4 ring-1 ring-white/15 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item && <Chip cls={CHANGE[item.change_type].cls}>{CHANGE[item.change_type].label}</Chip>}
            <h2 className="mt-1 text-lg font-semibold text-white">{item ? `${item.provider} · ${item.program}` : "Φόρτωση…"}</h2>
            {item && <p className="text-xs text-slate-500">Βρέθηκε {when(item.created_at)} · {STATUS_LABEL[item.status]}{item.reviewed_by ? ` από ${item.reviewed_by} (${when(item.reviewed_at!)})` : ""}</p>}
          </div>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
        {msg && <p className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">✓ {msg}</p>}

        {item && (
          <div className="mt-4 space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Αυτόματος έλεγχος</h3>
              <FlagList flags={liveFlags} />
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Πηγή</h3>
                {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline">Άνοιγμα πηγής ↗</a>}
                {item.source_document && <button className={btnGhost + small} onClick={() => openDocument(item.source_document!)}>📄 Αντίγραφο που διαβάστηκε</button>}
              </div>
              {item.evidence && <blockquote className="rounded-xl bg-white/[0.03] p-3 text-xs italic leading-relaxed text-slate-300 ring-1 ring-white/10">«{item.evidence}»</blockquote>}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Σύγκριση {pending && item.change_type !== "discontinued" ? "· διόρθωσε όποια τιμή χρειάζεται" : ""}</h3>
              <div className="overflow-x-auto rounded-xl ring-1 ring-white/10">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wider text-slate-400">
                    <tr><th className="px-3 py-2 text-left">Πεδίο</th><th className="px-3 py-2 text-left">Δημοσιευμένο</th><th className="px-3 py-2 text-left">Νέο</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {FORM_ORDER.map((k) => {
                      const changed = !!values && !!item.old_values && show(k, item.old_values) !== show(k, values);
                      return (
                        <tr key={k} className={changed ? "bg-amber-300/[0.06]" : ""}>
                          <td className="px-3 py-1.5 text-xs text-slate-400">{FIELD_LABEL[k]}</td>
                          <td className="px-3 py-1.5 text-xs text-slate-400">{show(k, item.old_values)}</td>
                          <td className="px-3 py-1.5">
                            {item.change_type === "discontinued" || !form ? (
                              <span className="text-xs text-red-300">{k === "name" ? "δεν εμφανίζεται πια στην πηγή" : ""}</span>
                            ) : !pending ? (
                              <span className="text-xs text-slate-100">{show(k, values)}</span>
                            ) : k === "color" ? (
                              <select className={`${input} !py-1 text-xs`} value={form.color} onChange={(e) => set("color", e.target.value)}>
                                <option value="">—</option>{Object.entries(COLOR_WORD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            ) : k === "segment" ? (
                              <select className={`${input} !py-1 text-xs`} value={form.segment} onChange={(e) => set("segment", e.target.value)}>
                                <option value="residential">Οικιακό</option><option value="business">Επαγγελματικό</option>
                              </select>
                            ) : k === "day_night" ? (
                              <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={form.day_night_b} onChange={(e) => set("day_night_b", e.target.checked)} />
                            ) : (
                              <input
                                className={`${input} !py-1 text-xs ${changed ? "!ring-amber-300/60" : ""}`}
                                value={form[k]}
                                inputMode={(NUM_FIELDS as readonly string[]).includes(k) ? "decimal" : undefined}
                                placeholder={k === "valid_from" || k === "valid_until" ? "ΕΕΕΕ-ΜΜ-ΗΗ" : k === "valid_month" ? "ΕΕΕΕ-ΜΜ" : ""}
                                onChange={(e) => set(k, e.target.value)}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Τιμές σε € χωρίς ΦΠΑ, μόνο χρεώσεις προμήθειας.</p>
            </section>

            {history.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Ιστορικό τιμής</h3>
                <PriceChart rows={history} />
              </section>
            )}

            <section className="space-y-2">
              <L t="Εσωτερικές σημειώσεις" hint="Δεν φαίνονται στο site. Καταγράφονται στο audit log.">
                <textarea className={`${input} min-h-[70px]`} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!pending} />
              </L>
            </section>

            {pending && (
              <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-white/10 bg-[#060a1c] px-4 py-3 sm:-mx-5 sm:px-5">
                <button className={btn} disabled={busy || (blocking && item.change_type !== "discontinued")} onClick={() => act("approve")} title={blocking ? "Διόρθωσε πρώτα τα σφάλματα" : ""}>
                  ✓ {item.change_type === "discontinued" ? "Έγκριση κατάργησης" : "Έγκριση & δημοσίευση"}
                </button>
                <button className={btnGhost} disabled={busy} onClick={() => act("save")}>💾 Αποθήκευση</button>
                <button className={btnGhost + " !text-red-200"} disabled={busy} onClick={() => act("reject")}>✕ Απόρριψη</button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/* ───────────── price chart (single series: price €/kWh over time) ───────────── */

function PriceChart({ rows }: { rows: HistoryRow[] }) {
  const pts = rows
    .filter((r) => r.price_per_kwh_eur !== null && r.change !== "deleted")
    .map((r) => ({ t: Date.parse(r.changed_at), p: Number(r.price_per_kwh_eur), r }))
    .sort((a, b) => a.t - b.t);
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length === 0) return <p className="text-xs text-slate-500">Χωρίς τιμές στο ιστορικό.</p>;
  const W = 600, H = 160, padL = 44, padR = 12, padT = 12, padB = 24;
  const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, Date.now());
  const ps = pts.map((x) => x.p);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  const span = hi - lo || hi * 0.1 || 0.01;
  const yMin = Math.max(0, lo - span * 0.25), yMax = hi + span * 0.25;
  const x = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * (W - padL - padR);
  const y = (p: number) => padT + (1 - (p - yMin) / (yMax - yMin)) * (H - padT - padB);
  // Step line: a price holds until the next change.
  let d = `M${x(pts[0].t)},${y(pts[0].p)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t)} V${y(pts[i].p)}`;
  d += ` H${x(t1)}`;
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const h = hover !== null ? pts[hover] : null;

  return (
    <div className="rounded-xl bg-white/[0.02] p-2 ring-1 ring-white/10">
      <div className="px-1 text-[11px] text-slate-400">Τιμή €/kWh (χωρίς ΦΠΑ)</div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Εξέλιξη τιμής €/kWh">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.07)" />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{v.toFixed(3)}</text>
            </g>
          ))}
          <text x={padL} y={H - 6} fontSize="10" fill="#94a3b8">{new Date(t0).toLocaleDateString("el-GR")}</text>
          <text x={W - padR} y={H - 6} textAnchor="end" fontSize="10" fill="#94a3b8">σήμερα</text>
          <path d={d} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" />
          {pts.map((pt, i) => (
            <g key={pt.r.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <circle cx={x(pt.t)} cy={y(pt.p)} r="12" fill="transparent" />
              <circle cx={x(pt.t)} cy={y(pt.p)} r="4" fill={pt.r.active === false ? "#64748b" : "#22d3ee"} stroke="#060a1c" strokeWidth="2" />
            </g>
          ))}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-1 rounded-lg bg-[#0a1028] px-2 py-1 text-[11px] text-slate-200 ring-1 ring-white/20" style={{ left: `${Math.min(70, (x(h.t) / W) * 100)}%` }}>
            <div className="font-semibold">{h.p.toFixed(4)} €/kWh</div>
            <div className="text-slate-400">{when(h.r.changed_at)} · {h.r.changed_by ?? "—"}</div>
          </div>
        )}
      </div>
      <HistoryTable rows={rows} />
    </div>
  );
}

const CHANGE_WORD: Record<string, string> = { baseline: "Αρχική εγγραφή", created: "Δημιουργία", updated: "Αλλαγή", deactivated: "Απόκρυψη", reactivated: "Επανεμφάνιση", deleted: "Διαγραφή" };

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const sorted = [...rows].sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[480px] text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-slate-500">
          <tr><th className="px-2 py-1 text-left">Ημερομηνία</th><th className="px-2 py-1 text-left">Τι έγινε</th><th className="px-2 py-1 text-right">€/kWh</th><th className="px-2 py-1 text-right">Πάγιο</th><th className="px-2 py-1 text-left">Μήνας</th><th className="px-2 py-1 text-left">Από</th></tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-1 text-slate-300">{when(r.changed_at)}</td>
              <td className="px-2 py-1 text-slate-300">{CHANGE_WORD[r.change] ?? r.change}{r.active === false && r.change !== "deactivated" ? " (κρυφό)" : ""}</td>
              <td className="px-2 py-1 text-right tabular-nums text-slate-100">{p4(r.price_per_kwh_eur as number)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-slate-300">{r.fixed_monthly_eur === null ? "—" : Number(r.fixed_monthly_eur).toFixed(2)}</td>
              <td className="px-2 py-1 text-slate-400">{r.valid_month ?? "—"}</td>
              <td className="px-2 py-1 text-slate-400">{r.changed_by ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── sources ───────────── */

const STATUS_CHIP: Record<string, { l: string; cls: string }> = {
  ok: { l: "✓ OK", cls: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/40" },
  unchanged: { l: "= Χωρίς αλλαγή", cls: "bg-white/5 text-slate-300 ring-white/15" },
  failed: { l: "✕ Αποτυχία", cls: "bg-red-500/15 text-red-200 ring-red-400/40" },
  running: { l: "… Τρέχει", cls: "bg-cyan-400/15 text-cyan-200 ring-cyan-300/40" },
};

type SourceForm = { provider_id: string; label: string; url: string; kind: Source["kind"]; segment: Source["segment"]; enabled: boolean; check_every_hours: string; notes: string };

function SourceEditor({ initial, providers, onClose, onSaved }: { initial?: Source; providers: Provider[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<SourceForm>({
    provider_id: initial?.provider_id ?? "", label: initial?.label ?? "", url: initial?.url ?? "", kind: initial?.kind ?? "site",
    segment: initial?.segment ?? "both", enabled: initial?.enabled ?? true, check_every_hours: String(initial?.check_every_hours ?? 24), notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SourceForm>(k: K, v: SourceForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, provider_id: f.provider_id || null, check_every_hours: Math.round(Number(f.check_every_hours) || 24), notes: f.notes || null };
      await api(initial ? `/api/admin/energy/sources/${initial.id}` : "/api/admin/energy/sources", { method: initial ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (err: any) {
      setError(err.message === "missing_site_migration" ? "Χρειάζεται μια μικρή αναβάθμιση της βάσης: κλείσε αυτό το παράθυρο και πάτα «＋ Προτεινόμενες πηγές» για να δεις το SQL." : err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{initial ? "Αλλαγή πηγής" : "Νέα πηγή"}</h2>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={save}>
          <L t="Πάροχος" hint="Κενό για πηγές με πολλούς παρόχους (π.χ. ΡΑΑΕΥ)">
            <select className={input} value={f.provider_id} onChange={(e) => set("provider_id", e.target.value)}>
              <option value="">— Πολλοί πάροχοι —</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </L>
          <L t="Όνομα *"><input className={input} value={f.label} onChange={(e) => set("label", e.target.value)} required placeholder="π.χ. ΔΕΗ · Οικιακά τιμολόγια" /></L>
          <L t="Site ή link *" hint={f.kind === "site" ? "Αρκεί η διεύθυνση του παρόχου, π.χ. dei.gr" : "Επίσημη σελίδα τιμών ή PDF τιμοκαταλόγου"}><input className={input} value={f.url} onChange={(e) => set("url", e.target.value)} required placeholder={f.kind === "site" ? "dei.gr" : "https://..."} /></L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Τύπος">
              <select className={input} value={f.kind} onChange={(e) => set("kind", e.target.value as Source["kind"])}>
                <option value="site">🌐 Ολόκληρο site (βρίσκει τις σελίδες μόνο του)</option><option value="auto">Μία σελίδα (αυτόματο)</option><option value="html">Μία σελίδα</option><option value="pdf">PDF</option>
              </select>
            </L>
            <L t="Πελάτες">
              <select className={input} value={f.segment} onChange={(e) => set("segment", e.target.value as Source["segment"])}>
                <option value="residential">Οικιακοί</option><option value="business">Επαγγελματικοί</option><option value="both">Και οι δύο</option>
              </select>
            </L>
            <L t="Έλεγχος κάθε (ώρες)"><input className={input} inputMode="numeric" value={f.check_every_hours} onChange={(e) => set("check_every_hours", e.target.value)} /></L>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
              <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Ενεργή
            </label>
          </div>
          <L t="Σημειώσεις"><textarea className={`${input} min-h-[60px]`} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></L>
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
          <button className={`${btn} w-full`} disabled={busy}>{busy ? "Αποθήκευση…" : "Αποθήκευση"}</button>
        </form>
      </aside>
    </div>
  );
}

interface RunResult { source_id: string; label: string; status: string; message: string; found: number; queued: number; verified: number }

function SourcesView({ onChanged }: { onChanged: () => void }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<Source | "new" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<RunResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ sources: Source[]; providers: Provider[] }>("/api/admin/energy/sources");
      setSources(d.sources);
      setProviders(d.providers);
    } catch (e: any) {
      setError(e.message);
      setSources([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const provName = (id: string | null) => (id ? providers.find((p) => p.id === id)?.name ?? "?" : "Πολλοί πάροχοι");

  const runOne = async (s: Source, force = false) => {
    setRunning((r) => ({ ...r, [s.id]: true }));
    try {
      const { result } = await api<{ result: RunResult }>("/api/admin/energy/sync", { method: "POST", body: JSON.stringify({ source_id: s.id, force }) });
      setResults((r) => [result, ...r.filter((x) => x.source_id !== s.id)]);
    } catch (e: any) {
      setResults((r) => [{ source_id: s.id, label: s.label, status: "failed", message: e.message, found: 0, queued: 0, verified: 0 }, ...r.filter((x) => x.source_id !== s.id)]);
    } finally {
      setRunning((r) => ({ ...r, [s.id]: false }));
    }
  };
  const runAll = async () => {
    setResults([]);
    // One request per source keeps every call well inside the server's time limit.
    // Whole sites first: they add the price pages they find, which are then read too.
    const enabled = (sources ?? []).filter((x) => x.enabled);
    for (const s of enabled.filter((x) => x.kind === "site")) await runOne(s);
    const fresh = await api<{ sources: Source[]; providers: Provider[] }>("/api/admin/energy/sources");
    setSources(fresh.sources);
    for (const s of fresh.sources.filter((x) => x.enabled && x.kind !== "site")) await runOne(s);
    await load();
    onChanged();
  };
  const anyRunning = Object.values(running).some(Boolean);

  if (!sources) return <p className="text-sm text-slate-500">Φόρτωση…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">Επίσημες σελίδες και PDF των παρόχων. Ελέγχονται αυτόματα κάθε πρωί (06:00).</p>
        <div className="flex gap-2">
          <button className={btn + small} disabled={anyRunning} onClick={runAll}>{anyRunning ? "⏳ Έλεγχος…" : "↻ Έλεγχος όλων τώρα"}</button>
          <button className={btnGhost + small} disabled={anyRunning} onClick={async () => {
            try {
              const r = await api<{ added: number }>("/api/admin/energy/sources/suggested", { method: "POST", body: "{}" });
              setError(null);
              setResults([{ source_id: "suggested", label: "Προτεινόμενες πηγές", status: "ok", message: r.added ? `Προστέθηκαν ${r.added} νέες πηγές. Πάτα «Έλεγχος όλων τώρα».` : "Υπάρχουν ήδη όλες.", found: 0, queued: 0, verified: 0 }]);
              load();
            } catch (e: any) { setError(e.message); }
          }}>＋ Προτεινόμενες πηγές</button>
          <button className={btnGhost + small} onClick={() => setEditing("new")}>＋ Νέα πηγή</button>
          <button className={btnGhost + small} onClick={() => setUploading(true)}>📄 Ανέβασε τιμοκατάλογο</button>
        </div>
      </div>
      {error === "missing_site_migration" ? (
        <SqlStep title="Μικρή αναβάθμιση για πηγές «ολόκληρο site»" text="Για να βάζεις σκέτο το site ενός παρόχου (π.χ. dei.gr), χρειάζεται μία φορά αυτό το SQL." sql={SITE_SQL} onRetry={() => { setError(null); load(); }} />
      ) : error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {results.length > 0 && (
        <div className={`${card} space-y-1 text-xs`}>
          {results.map((r) => (
            <div key={r.source_id} className="flex flex-wrap items-center gap-2">
              <Chip cls={STATUS_CHIP[r.status]?.cls ?? AWAITING}>{STATUS_CHIP[r.status]?.l ?? r.status}</Chip>
              <span className="text-slate-200">{r.label}</span>
              <span className="text-slate-400">{r.message}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {sources.map((s) => (
          <div key={s.id} className={`${card} ${s.enabled ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{s.label}</span>
                  {s.last_status && <Chip cls={STATUS_CHIP[s.last_status].cls}>{STATUS_CHIP[s.last_status].l}</Chip>}
                  {!s.enabled && <Chip cls="bg-white/5 text-slate-400 ring-white/15">Ανενεργή</Chip>}
                </div>
                <div className="text-xs text-slate-400">{provName(s.provider_id)} · {s.kind === "site" ? "🌐 Ολόκληρο site" : s.kind === "pdf" ? "PDF" : s.discovered_from ? "↳ βρέθηκε αυτόματα" : "Σελίδα"} · {s.segment === "business" ? "επαγγελματικά" : s.segment === "both" ? "οικιακά & επαγγελματικά" : "οικιακά"} · κάθε {s.check_every_hours} ώρες · τελευταίος έλεγχος {ago(s.last_checked_at)}</div>
                {s.url.startsWith("upload:") ? <span className="block text-xs text-slate-500">ανεβασμένο αρχείο</span> : <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-cyan-300 underline">{s.url}</a>}
                {s.last_status === "failed" && s.last_error && <p className="mt-1 text-xs text-red-300">⚠️ {s.last_error}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className={btnGhost + small} disabled={!!running[s.id]} onClick={() => runOne(s).then(() => { load(); onChanged(); })}>{running[s.id] ? "⏳" : "↻ Έλεγχος"}</button>
                <button className={btnGhost + small} disabled={!!running[s.id]} title="Ξαναδιαβάζει την πηγή ακόμη κι αν δεν άλλαξε" onClick={() => runOne(s, true).then(() => { load(); onChanged(); })}>⟳ Πλήρης</button>
                {s.last_document_path && <button className={btnGhost + small} onClick={() => openDocument(s.last_document_path!)}>📄</button>}
                <button className={btnGhost + small} onClick={() => setEditing(s)}>✏️</button>
                <button className={btnGhost + small} onClick={async () => { if (confirm(`Διαγραφή πηγής «${s.label}»;`)) { await api(`/api/admin/energy/sources/${s.id}`, { method: "DELETE" }); load(); } }}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {uploading && (
        <UploadPanel providers={providers} onClose={() => setUploading(false)} onDone={(r) => { setUploading(false); setResults((x) => [r, ...x]); load(); onChanged(); }} />
      )}
      {editing && (
        <SourceEditor initial={editing === "new" ? undefined : editing} providers={providers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function UploadPanel({ providers, onClose, onDone }: { providers: Provider[]; onClose: () => void; onDone: (r: RunResult) => void }) {
  const [provider, setProvider] = useState("");
  const [segment, setSegment] = useState("both");
  const [pageUrl, setPageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Διάλεξε αρχείο");
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("provider_id", provider);
      fd.set("segment", segment);
      fd.set("page_url", pageUrl.trim() && !/^https?:\/\//i.test(pageUrl.trim()) ? `https://${pageUrl.trim()}` : pageUrl.trim());
      const res = await fetch("/api/admin/energy/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Σφάλμα ${res.status}`);
      onDone(j.result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-[#060a1c] p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">📄 Ανέβασε τιμοκατάλογο</h2>
          <button className={btnGhost} onClick={onClose}>✕</button>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Για sites που δεν επιτρέπουν αυτόματη ανάγνωση: κατέβασε από το site του παρόχου τον τιμοκατάλογο (PDF) ή αποθήκευσε τη σελίδα τιμών
          (στον υπολογιστή: Αρχείο → Αποθήκευση ως → «Ιστοσελίδα, μόνο HTML»). Το Billi θα διαβάσει τις τιμές και θα τις βάλει για έγκριση.
        </p>
        <form className="mt-4 space-y-3" onSubmit={send}>
          <L t="Πάροχος">
            <select className={input} value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">— Πολλοί πάροχοι —</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </L>
          <L t="Πελάτες">
            <select className={input} value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="both">Οικιακοί και επαγγελματικοί</option><option value="residential">Οικιακοί</option><option value="business">Επαγγελματικοί</option>
            </select>
          </L>
          <L t="Από ποια σελίδα το πήρες" hint="Το link της σελίδας του παρόχου. Χρειάζεται ως πηγή για την έγκριση."><input className={input} value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://zenith.gr/..." /></L>
          <L t="Αρχείο (PDF ή HTML, έως 4 MB)"><input type="file" accept="application/pdf,.pdf,text/html,.html,.htm" className={input} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></L>
          {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
          <button className={`${btn} w-full`} disabled={busy}>{busy ? "⏳ Ανάγνωση… (έως 1 λεπτό)" : "Ανάγνωση τιμών"}</button>
        </form>
      </aside>
    </div>
  );
}

/* ───────────── providers ───────────── */

function ProvidersView() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [editing, setEditing] = useState<Provider | "new" | null>(null);
  const [form, setForm] = useState({ name: "", aliases: "", website: "", active: true, notes: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<{ sources: Source[]; providers: Provider[] }>("/api/admin/energy/sources");
    setProviders(d.providers);
    setSources(d.sources);
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  const edit = (p: Provider | "new") => {
    setEditing(p);
    setError(null);
    setForm(p === "new" ? { name: "", aliases: "", website: "", active: true, notes: "" } : { name: p.name, aliases: p.aliases.filter((a) => a !== p.name).join(", "), website: p.website ?? "", active: p.active, notes: p.notes ?? "" });
  };
  const save = async () => {
    try {
      const body = { ...form, aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean), notes: form.notes || null };
      await api(editing === "new" ? "/api/admin/energy/providers" : `/api/admin/energy/providers/${(editing as Provider).id}`, { method: editing === "new" ? "POST" : "PUT", body: JSON.stringify(body) });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!providers) return <p className="text-sm text-slate-500">Φόρτωση…</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Προμηθευτές ρεύματος. Τα «άλλα ονόματα» βοηθούν να αναγνωρίζονται στις πηγές.</p>
        <button className={btnGhost + small} onClick={() => edit("new")}>＋ Νέος πάροχος</button>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {editing && (
        <div className={`${card} grid gap-3 sm:grid-cols-2`}>
          <L t="Όνομα *"><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></L>
          <L t="Site"><input className={input} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></L>
          <L t="Άλλα ονόματα" hint="χωρισμένα με κόμμα"><input className={input} value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></L>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-300"><input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ενεργός</label>
          <div className="flex gap-2 sm:col-span-2">
            <button className={btn + small} onClick={save}>Αποθήκευση</button>
            <button className={btnGhost + small} onClick={() => setEditing(null)}>Άκυρο</button>
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((p) => {
          const n = sources.filter((s) => s.provider_id === p.id).length;
          return (
            <div key={p.id} className={`${card} flex items-start justify-between gap-2 ${p.active ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <div className="font-semibold text-white">{p.name}</div>
                <div className="text-xs text-slate-400">{n ? `${n} πηγές` : <span className="text-amber-200">χωρίς πηγή: πρόσθεσε μία στις Πηγές</span>}</div>
                {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline">{p.website.replace(/^https?:\/\//, "")}</a>}
              </div>
              <button className={btnGhost + small} onClick={() => edit(p)}>✏️</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── history ───────────── */

interface ProgrammeSummary { tariff_id: string; provider: string; name: string; changes: number; last_change_at: string; last_change: string; price: number | null; active: boolean | null }

function HistoryView() {
  const [list, setList] = useState<ProgrammeSummary[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ programmes: ProgrammeSummary[] }>("/api/admin/energy/history").then((d) => setList(d.programmes)).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!sel) return;
    setRows(null);
    api<{ history: HistoryRow[] }>(`/api/admin/energy/history?tariff_id=${encodeURIComponent(sel)}`).then((d) => setRows(d.history)).catch((e) => setError(e.message));
  }, [sel]);
  const shown = (list ?? []).filter((p) => !q.trim() || `${p.provider} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  const current = list?.find((p) => p.tariff_id === sel);

  if (error) return <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>;
  if (!list) return <p className="text-sm text-slate-500">Φόρτωση…</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="space-y-2">
        <input className={input} placeholder="Αναζήτηση προγράμματος…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
          {shown.map((p) => (
            <li key={p.tariff_id}>
              <button onClick={() => setSel(p.tariff_id)} className={`w-full rounded-xl px-3 py-2 text-left ring-1 transition ${sel === p.tariff_id ? "bg-cyan-400/10 ring-cyan-300/50" : "bg-white/[0.02] ring-white/10 hover:bg-white/[0.05]"}`}>
                <div className="text-sm text-slate-100">{p.provider} · {p.name}{p.last_change === "deleted" ? " (διαγράφηκε)" : p.active === false ? " (κρυφό)" : ""}</div>
                <div className="text-[11px] text-slate-500">{p4(p.price)} €/kWh · {p.changes} εγγραφές · {when(p.last_change_at)}</div>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="text-sm text-slate-500">Κανένα πρόγραμμα.</li>}
        </ul>
      </div>
      <div>
        {!sel ? (
          <p className={`${card} text-sm text-slate-400`}>Διάλεξε πρόγραμμα για να δεις πώς άλλαξε η τιμή του. Κάθε αλλαγή κρατιέται για πάντα: το ιστορικό δεν διορθώνεται ούτε σβήνεται.</p>
        ) : !rows ? (
          <p className="text-sm text-slate-500">Φόρτωση…</p>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">{current?.provider} · {current?.name}</h3>
            <PriceChart rows={rows} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────── logs ───────────── */

interface ActivityRow { id: number; created_at: string; admin: string; action: string; entity: string; entity_id: string | null; before: any; after: any; source_url: string | null; source_document: string | null; note: string | null }

const ACTION_WORD: Record<string, string> = {
  approve_new: "Έγκριση νέου προγράμματος", approve_price_change: "Έγκριση αλλαγής τιμής", approve_details_change: "Έγκριση αλλαγής όρων",
  approve_discontinued: "Έγκριση κατάργησης", reject_new: "Απόρριψη νέου προγράμματος", reject_price_change: "Απόρριψη αλλαγής τιμής",
  reject_details_change: "Απόρριψη αλλαγής όρων", reject_discontinued: "Απόρριψη κατάργησης", queue_edit: "Διόρθωση τιμών σε αναμονή",
  queue_note: "Σημείωση", tariff_create: "Νέο πρόγραμμα (χειροκίνητα)", tariff_update: "Αλλαγή προγράμματος (χειροκίνητα)",
  tariff_delete: "Διαγραφή προγράμματος", tariff_import: "Εισαγωγή ενδεικτικών τιμών", tariff_month_change: "Αλλαγή μήνα τιμών",
  source_create: "Νέα πηγή", source_update: "Αλλαγή πηγής", source_delete: "Διαγραφή πηγής", provider_create: "Νέος πάροχος", provider_update: "Αλλαγή παρόχου",
};

const priceOf = (v: any) => (v && v.price_per_kwh_eur !== undefined && v.price_per_kwh_eur !== null ? `${Number(v.price_per_kwh_eur).toFixed(4)} €/kWh, πάγιο ${v.fixed_monthly_eur ?? "—"}` : null);

function LogsView({ kind, setKind }: { kind: "runs" | "failed" | "activity"; setKind: (k: "runs" | "failed" | "activity") => void }) {
  const [runs, setRuns] = useState<RunLog[] | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (kind === "activity") api<{ activity: ActivityRow[] }>("/api/admin/energy/logs?kind=activity").then((d) => setActivity(d.activity)).catch((e) => setError(e.message));
    else {
      setRuns(null);
      Promise.all([api<{ runs: RunLog[] }>(`/api/admin/energy/logs?kind=runs${kind === "failed" ? "&failed=1" : ""}`), api<{ sources: Source[] }>("/api/admin/energy/sources")])
        .then(([r, s]) => { setRuns(r.runs); setSources(s.sources); })
        .catch((e) => setError(e.message));
    }
  }, [kind]);
  const label = (id: string | null) => sources.find((s) => s.id === id)?.label ?? "—";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className={(kind === "runs" ? btn : btnGhost) + small} onClick={() => setKind("runs")}>Έλεγχοι πηγών</button>
        <button className={(kind === "failed" ? btn : btnGhost) + small} onClick={() => setKind("failed")}>Μόνο αποτυχίες</button>
        <button className={(kind === "activity" ? btn : btnGhost) + small} onClick={() => setKind("activity")}>Ενέργειες διαχειριστών (audit)</button>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}
      {kind !== "activity" ? (
        !runs ? <p className="text-sm text-slate-500">Φόρτωση…</p> : runs.length === 0 ? <p className={`${card} text-sm text-slate-400`}>Δεν υπάρχουν εγγραφές.</p> : (
          <ul className="space-y-1.5">
            {runs.map((r) => (
              <li key={r.id} className={`${card} !py-2.5 text-xs`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip cls={STATUS_CHIP[r.status]?.cls ?? AWAITING}>{STATUS_CHIP[r.status]?.l ?? r.status}</Chip>
                  <span className="font-semibold text-slate-100">{label(r.source_id)}</span>
                  <span className="text-slate-500">{when(r.started_at)} · {r.trigger === "cron" ? "αυτόματα" : `χειροκίνητα${r.admin ? ` (${r.admin})` : ""}`}</span>
                  {r.document_path && <button className="text-cyan-300 underline" onClick={() => openDocument(r.document_path!)}>αντίγραφο</button>}
                </div>
                <div className={`mt-1 ${r.status === "failed" ? "text-red-300" : "text-slate-400"}`}>{r.message}{r.found ? ` · βρέθηκαν ${r.found}` : ""}{r.queued ? ` · σε αναμονή ${r.queued}` : ""}{r.verified ? ` · επιβεβαιώθηκαν ${r.verified}` : ""}</div>
              </li>
            ))}
          </ul>
        )
      ) : !activity ? <p className="text-sm text-slate-500">Φόρτωση…</p> : activity.length === 0 ? <p className={`${card} text-sm text-slate-400`}>Δεν υπάρχουν ενέργειες ακόμα.</p> : (
        <ul className="space-y-1.5">
          {activity.map((a) => {
            const b = priceOf(a.before);
            const n = priceOf(a.after);
            return (
              <li key={a.id} className={`${card} !py-2.5 text-xs`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-100">{ACTION_WORD[a.action] ?? a.action}</span>
                  <span className="text-slate-500">{when(a.created_at)} · 👤 {a.admin}</span>
                </div>
                {(a.after?.provider || a.before?.provider) && <div className="mt-0.5 text-slate-300">{a.after?.provider ?? a.before?.provider} · {a.after?.name ?? a.before?.name}</div>}
                {(b || n) && <div className="mt-0.5 text-slate-400">{b ?? "—"} → {n ?? "—"}</div>}
                {a.note && <div className="mt-0.5 text-slate-400">📝 {a.note}</div>}
                <div className="mt-0.5 flex flex-wrap gap-3">
                  {a.source_url && <a href={a.source_url} target="_blank" rel="noreferrer" className="text-cyan-300 underline">πηγή ↗</a>}
                  {a.source_document && <button className="text-cyan-300 underline" onClick={() => openDocument(a.source_document!)}>έγγραφο που διαβάστηκε</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bill, Tariff, TariffColor } from "@/lib/types";
import { COLOR_INFO } from "@/lib/types";
import type { Comparison, Offer } from "@/lib/compare";

interface Result {
  bill: Bill;
  warnings: string[];
  comparison: Comparison | null;
  tariffs_updated_at: string | null;
}

const eur = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("el-GR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;

const COLORS: TariffColor[] = ["blue", "green", "yellow", "orange"];

const COLOR_CLASS: Record<TariffColor, string> = {
  blue: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  yellow: "bg-yellow-500/15 text-yellow-200 ring-yellow-400/30",
  orange: "bg-orange-500/15 text-orange-300 ring-orange-400/30",
};

function ColorBadge({ color }: { color: TariffColor | null }) {
  if (!color) return <span className="text-slate-500">—</span>;
  const c = COLOR_INFO[color];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${COLOR_CLASS[color]}`}>
      {c.emoji} {c.label}
    </span>
  );
}

const offerPrice = (o: Offer) => o.tariff.price_per_kwh_with_discount_eur ?? o.tariff.price_per_kwh_eur;
const offerAnnual = (o: Offer) => o.annualWithDiscount ?? o.annual;

/** Shrinks photos in the browser: the API caps images at 5 MB and a bill reads fine at 2000px. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/* ───────────── shared UI pieces ───────────── */

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 via-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/15 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50";
const btnSmall =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/15 transition hover:bg-white/10";

function Select<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="w-full appearance-none rounded-xl bg-[#0a1028] py-2.5 pl-3 pr-9 text-sm text-slate-100 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
      </span>
    </label>
  );
}

function Card({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-6 scroll-mt-20 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10 backdrop-blur sm:p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      {children}
    </section>
  );
}

/** Collapsible section with a visible border and a rotating chevron. */
function Accordion({ summary, children, defaultOpen = false, highlight = false }: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className={`group rounded-xl ring-1 transition ${highlight ? "bg-cyan-400/[0.06] ring-cyan-300/50" : "bg-white/[0.02] ring-white/10"}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">{summary}</div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-white/10 px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

/* ───────────── page ───────────── */

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const step = result ? 3 : loading ? 2 : 1;

  async function onFile(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", await shrinkImage(file));
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Σφάλμα");
      setResult(json);
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <TopBar onNew={result ? reset : undefined} />

      <main className="relative mx-auto max-w-3xl px-4 pb-16 pt-6">
        <header className="flex flex-col items-center text-center">
          <h1><img src="/logo.png" alt="Billi — Know your bills. Save more." className="h-40 w-auto sm:h-52" /></h1>
          <div className="mt-4 flex flex-wrap justify-center gap-2 whitespace-nowrap text-xs">
            <span className="rounded-full bg-blue-500/15 px-3 py-1 text-blue-300 ring-1 ring-blue-400/30">⚡ Ρεύμα</span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-slate-500 ring-1 ring-white/10">🔥 Αέριο · σύντομα</span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-slate-500 ring-1 ring-white/10">📶 Internet · σύντομα</span>
          </div>
        </header>

        <Steps current={step} />

        <section id="upload" className="scroll-mt-20">
          <div
            className={`gradient-border mt-6 rounded-2xl transition ${dragging ? "scale-[1.01]" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !loading) onFile(f);
            }}
          >
            <div className={`flex flex-col items-center rounded-2xl px-5 py-8 text-center sm:px-8 ${dragging ? "bg-[#0c1636]" : "bg-[#060a1c]"}`}>
              {loading ? (
                <>
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-cyan-300" />
                  <p className="mt-4 font-semibold text-white">Το Billi διαβάζει τον λογαριασμό…</p>
                  <p className="mt-1 text-sm text-slate-400">Συνήθως 5–15 δευτερόλεπτα</p>
                </>
              ) : (
                <>
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-violet-500 text-2xl shadow-lg shadow-cyan-500/20">⚡</span>
                  <p className="mt-4 text-lg font-semibold text-white">Ανέβασε τον λογαριασμό ρεύματος</p>
                  <p className="mt-1 text-sm text-slate-400">PDF ή φωτογραφία · έως 10 MB</p>

                  <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <button type="button" className={btnPrimary} onClick={() => fileInput.current?.click()}>
                      📄 Επίλεξε αρχείο
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => cameraInput.current?.click()}>
                      📷 Φωτογράφισε τον λογαριασμό
                    </button>
                  </div>
                  <p className="mt-4 hidden text-xs text-slate-500 sm:block">ή σύρε το αρχείο εδώ</p>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={loading}
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={loading}
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">🔒 Το billi δεν αποθηκεύει τον λογαριασμό σου. Τον στέλνει μόνο για ανάλυση.</p>
        </section>

        {error && (
          <div className="mt-6 flex items-start justify-between gap-3 rounded-xl bg-red-500/10 p-4 text-red-300 ring-1 ring-red-400/30">
            <span>⚠️ {error}</span>
            <button type="button" className={btnSmall} onClick={() => fileInput.current?.click()}>Δοκίμασε ξανά</button>
          </div>
        )}

        {result && (
          <div id="results" className="scroll-mt-20">
            <BillSummary bill={result.bill} warnings={result.warnings} />
            {result.comparison && (
              <ComparisonView c={result.comparison} current={result.bill} updatedAt={result.tariffs_updated_at} />
            )}
            <div className="mt-8 flex justify-center">
              <button type="button" className={btnSecondary} onClick={reset}>↺ Ανάλυσε άλλον λογαριασμό</button>
            </div>
          </div>
        )}

        <ProviderCatalog offers={result?.comparison?.offers ?? null} />

        <HowItWorks />
      </main>
    </>
  );
}

/* ───────────── top bar with dropdown menu ───────────── */

function TopBar({ onNew }: { onNew?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const items: { id: string; icon: string; label: string }[] = [
    { id: "upload", icon: "⚡", label: "Ανάλυση λογαριασμού" },
    { id: "colors", icon: "🎨", label: "Ποιο χρώμα με συμφέρει" },
    { id: "compare", icon: "📊", label: "Σύγκριση παρόχων" },
    { id: "providers", icon: "🏢", label: "Προγράμματα ανά εταιρεία" },
    { id: "how", icon: "❓", label: "Πώς δουλεύει" },
  ];

  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-[#01030f]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="text-lg font-extrabold tracking-tight text-white">
          Bill<span className="text-gradient">i</span>
        </button>
        <div className="flex items-center gap-2">
          {onNew && <button type="button" className={btnSmall} onClick={onNew}>＋ Νέα ανάλυση</button>}
          <div ref={ref} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-white/10"
            >
              ☰ Μενού <span className={`inline-block transition ${open ? "rotate-180" : ""}`}>▾</span>
            </button>
            {open && (
              <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl bg-[#0a1028] p-1.5 shadow-2xl shadow-black/50 ring-1 ring-white/15">
                {items.map((it) => (
                  <button
                    key={it.id}
                    role="menuitem"
                    type="button"
                    onClick={() => go(it.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10"
                  >
                    <span className="w-5 text-center">{it.icon}</span>{it.label}
                  </button>
                ))}
                <div className="my-1 border-t border-white/10" />
                <div className="px-3 py-2 text-xs text-slate-500">🔥 Αέριο & 📶 Internet · σύντομα</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Steps({ current }: { current: number }) {
  const steps = ["Ανέβασμα", "Ανάλυση Billi", "Πρόταση"];
  return (
    <ol className="mt-6 flex items-center justify-center gap-2 text-xs sm:gap-3">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li key={s} className="flex items-center gap-2 sm:gap-3">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${
              state === "now" ? "bg-cyan-400/10 text-cyan-200 ring-cyan-300/50" : state === "done" ? "bg-emerald-400/10 text-emerald-300 ring-emerald-300/30" : "text-slate-500 ring-white/10"
            }`}>
              <span className="font-bold">{state === "done" ? "✓" : n}</span> {s}
            </span>
            {n < steps.length && <span className="text-slate-600">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────── bill ───────────── */

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/10">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-semibold text-white">{value}</div>
    </div>
  );
}

function BillSummary({ bill, warnings }: { bill: Bill; warnings: string[] }) {
  const rows: [string, React.ReactNode][] = [
    ["Πάροχος", bill.provider ?? "—"],
    ["Πρόγραμμα", bill.program_name ?? "—"],
    ["Χρώμα", <ColorBadge key="c" color={bill.tariff_color} />],
    ["Περίοδος", bill.period_start && bill.period_end ? `${bill.period_start} – ${bill.period_end}` : "—"],
    ["Τιμή ενέργειας", bill.kwh_rate !== null ? `${bill.kwh_rate} €/kWh` : "—"],
    ["Πάγιο", eur(bill.fixed_monthly_fee)],
    ["Έκπτωση συνέπειας", eur(bill.consistency_discount)],
    ["Σύνολο προμήθειας", eur(bill.supplier_total)],
    ["Ρυθμιζόμενες χρεώσεις", eur(bill.regulated_total)],
    ["Δήμος & ΕΡΤ", eur(bill.municipal_total)],
    ["ΦΠΑ", eur(bill.vat_amount)],
  ];
  return (
    <Card title="Ο λογαριασμός σου">
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-blue-500/15 via-cyan-400/10 to-violet-500/15 px-4 py-3 ring-1 ring-white/10">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{bill.provider ?? "Άγνωστος πάροχος"}</div>
          <div className="truncate text-xs text-slate-400">{bill.program_name ?? ""}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Σύνολο</div>
          <div className="whitespace-nowrap text-2xl font-bold text-white">{eur(bill.total_due)}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Κατανάλωση" value={bill.kwh_total !== null ? `${bill.kwh_total} kWh` : "—"} />
        <Stat label="Ημέρες" value={bill.billing_days ?? "—"} />
        <Stat label="Χρώμα" value={<ColorBadge color={bill.tariff_color} />} />
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200 ring-1 ring-amber-300/20">
          {warnings.map((w) => <li key={w}>⚠️ {w}</li>)}
        </ul>
      )}

      <div className="mt-3">
        <Accordion summary={<span className="text-sm font-semibold text-slate-200">Όλες οι λεπτομέρειες του λογαριασμού</span>}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-400">{k}</dt>
                <dd className="text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </Accordion>
      </div>
    </Card>
  );
}

/* ───────────── colours + comparison ───────────── */

type ColorFilter = "all" | TariffColor;
type SortKey = "annual" | "kwh" | "fee";

function ComparisonView({ c, current, updatedAt }: { c: Comparison; current: Bill; updatedAt: string | null }) {
  const [color, setColor] = useState<ColorFilter>("all");
  const [sort, setSort] = useState<SortKey>("annual");
  const [noFee, setNoFee] = useState(false);
  const [noLockIn, setNoLockIn] = useState(false);
  const [provider, setProvider] = useState("all");
  const providers = useMemo(() => [...new Set(c.offers.map((o) => o.tariff.provider))].sort((a, b) => a.localeCompare(b, "el")), [c.offers]);

  const recommended = c.recommendation ? c.byColor[c.recommendation.color] : null;

  const isCurrent = (o: Offer) =>
    !!current.provider && o.tariff.provider.toLowerCase() === current.provider.toLowerCase() &&
    !!current.program_name && o.tariff.name.toLowerCase() === current.program_name.toLowerCase();

  const shown = useMemo(() => {
    const key: Record<SortKey, (o: Offer) => number> = {
      annual: offerAnnual,
      kwh: offerPrice,
      fee: (o) => o.tariff.fixed_monthly_eur,
    };
    return c.offers
      .filter((o) => color === "all" || o.tariff.color === color)
      .filter((o) => provider === "all" || o.tariff.provider === provider)
      .filter((o) => !noFee || o.tariff.fixed_monthly_eur === 0)
      .filter((o) => !noLockIn || !o.tariff.min_duration_months)
      .sort((a, b) => key[sort](a) - key[sort](b));
  }, [c.offers, color, provider, sort, noFee, noLockIn]);

  const filterChip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${on ? "bg-cyan-400/15 text-cyan-200 ring-cyan-300/50" : "bg-white/5 text-slate-300 ring-white/15 hover:bg-white/10"}`;

  return (
    <>
      <Card
        id="colors"
        title="Ποιο χρώμα σε συμφέρει"
        subtitle={
          <>
            Εκτιμώμενη ετήσια κατανάλωση: <strong className="text-slate-200">{c.annualKwh.toLocaleString("el-GR")} kWh</strong>
            {c.currentAnnual !== null && <> · Σήμερα πληρώνεις ~<strong className="text-slate-200">{eur(c.currentAnnual, 0)}</strong>/έτος για προμήθεια</>}
          </>
        }
      >
        {c.recommendation && (
          <div className="gradient-border mt-5 rounded-xl">
            <div className="rounded-xl bg-[#081028] p-4 sm:p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-gradient">✦ Πρόταση Billi</div>
              <div className="mt-1.5 text-lg font-semibold text-white">{COLOR_INFO[c.recommendation.color].emoji} {c.recommendation.text}</div>

              {recommended && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{recommended.tariff.provider} · {recommended.tariff.name}</div>
                    <div className="text-xs text-slate-400">{offerPrice(recommended).toFixed(3)} €/kWh · πάγιο {eur(recommended.tariff.fixed_monthly_eur)}</div>
                  </div>
                  <div className="text-right">
                    <div className="whitespace-nowrap text-xl font-bold text-white">{eur(offerAnnual(recommended), 0)}<span className="text-xs font-normal text-slate-400">/έτος</span></div>
                    {recommended.savings !== null && recommended.savings > 0 && (
                      <div className="text-xs text-emerald-300">κερδίζεις {eur(recommended.savings, 0)}</div>
                    )}
                  </div>
                </div>
              )}

              {c.recommendation.reasons.length > 0 && (
                <div className="mt-3">
                  <Accordion defaultOpen summary={<span className="text-sm font-semibold text-slate-200">Γιατί αυτό;</span>}>
                    <ul className="space-y-2 text-sm text-slate-300">
                      {c.recommendation.reasons.map((r) => (
                        <li key={r} className="flex gap-2"><span className="text-cyan-300">•</span><span>{r}</span></li>
                      ))}
                    </ul>
                  </Accordion>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {recommended?.tariff.url && (
                  <a href={recommended.tariff.url} target="_blank" rel="noreferrer" className={btnPrimary}>Δες το πρόγραμμα ↗</a>
                )}
                <button type="button" className={btnSecondary} onClick={() => document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" })}>
                  Όλη η σύγκριση ↓
                </button>
              </div>
            </div>
          </div>
        )}

        <h3 className="mt-6 text-sm font-semibold text-white">Πότε συμφέρει κάθε χρώμα</h3>
        <p className="mt-1 text-xs text-slate-500">Πάτα σε ένα χρώμα για να δεις πότε σε συμφέρει.</p>
        <div className="mt-3 space-y-2">
          {COLORS.map((col) => {
            const best = c.byColor[col];
            const info = COLOR_INFO[col];
            return (
              <Accordion
                key={col}
                highlight={c.recommendation?.color === col}
                summary={
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <ColorBadge color={col} />
                      {(current.tariff_color === col || c.recommendation?.color === col) && (
                        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider">
                          {c.recommendation?.color === col && <span className="text-cyan-300">✦ προτείνεται</span>}
                          {c.recommendation?.color === col && current.tariff_color === col && <span className="text-slate-600"> · </span>}
                          {current.tariff_color === col && <span className="text-slate-400">το δικό σου</span>}
                        </span>
                      )}
                    </div>
                    <div className="whitespace-nowrap text-right text-sm font-semibold text-white">
                      {best ? <>{eur(offerAnnual(best), 0)}<span className="text-xs font-normal text-slate-400">/έτος</span></> : <span className="text-xs font-normal text-slate-500">χωρίς τιμές</span>}
                    </div>
                  </div>
                }
              >
                <p className="text-xs text-slate-400">{info.description}</p>
                <p className="mt-2 text-sm text-slate-300"><span className="font-semibold text-emerald-300">✓ Σε συμφέρει όταν</span> {info.when}</p>
                <p className="mt-2 text-sm text-slate-300"><span className="font-semibold text-amber-300">! Προσοχή:</span> {info.risk}</p>
                {best && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] p-2.5 text-xs ring-1 ring-white/10">
                    <span className="text-slate-300">Φθηνότερο: <strong className="text-white">{best.tariff.provider} {best.tariff.name}</strong></span>
                    <button type="button" className={btnSmall} onClick={() => { setColor(col); document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" }); }}>
                      Δες όλα ↓
                    </button>
                  </div>
                )}
              </Accordion>
            );
          })}
        </div>
      </Card>

      <Card id="compare" title="Σύγκριση παρόχων" subtitle="Ετήσιο κόστος προμήθειας για τη δική σου κατανάλωση">
        {c.offers.length === 0 ? (
          <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-400">Δεν υπάρχουν ακόμα τιμές παρόχων.</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Select<string>
                label="Πάροχος"
                value={provider}
                onChange={setProvider}
                options={[{ value: "all", label: "Όλοι" }, ...providers.map((p) => ({ value: p, label: p }))]}
              />
              <Select<ColorFilter>
                label="Χρώμα"
                value={color}
                onChange={setColor}
                options={[{ value: "all", label: "Όλα" }, ...COLORS.map((x) => ({ value: x, label: `${COLOR_INFO[x].emoji} ${COLOR_INFO[x].label}` }))]}
              />
              <div className="col-span-2 sm:col-span-1 flex">
              <Select<SortKey>
                label="Ταξινόμηση"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "annual", label: "Ετήσιο κόστος" },
                  { value: "kwh", label: "Τιμή kWh" },
                  { value: "fee", label: "Πάγιο" },
                ]}
              />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={filterChip(noFee)} onClick={() => setNoFee((v) => !v)}>{noFee ? "✓ " : ""}Χωρίς πάγιο</button>
              <button type="button" className={filterChip(noLockIn)} onClick={() => setNoLockIn((v) => !v)}>{noLockIn ? "✓ " : ""}Χωρίς δέσμευση</button>
              {(color !== "all" || provider !== "all" || noFee || noLockIn) && (
                <button type="button" className="px-2 text-xs font-semibold text-slate-400 underline" onClick={() => { setColor("all"); setProvider("all"); setNoFee(false); setNoLockIn(false); }}>
                  Καθαρισμός
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">{shown.length} από {c.offers.length} προγράμματα</p>

            {shown.length === 0 ? (
              <p className="mt-3 rounded-xl bg-white/5 p-4 text-sm text-slate-400">Κανένα πρόγραμμα με αυτά τα φίλτρα.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {shown.map((o) => {
                  const rec = o.tariff.id === recommended?.tariff.id;
                  return (
                    <li key={o.tariff.id} className={`rounded-xl p-4 ring-1 transition ${rec ? "bg-cyan-400/[0.07] ring-cyan-300/50" : "bg-white/[0.02] ring-white/10 hover:ring-white/20"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{o.tariff.provider}</span>
                            {rec && <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">✦ Πρόταση</span>}
                            {isCurrent(o) && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">Τρέχον</span>}
                          </div>
                          <div className="text-sm text-slate-400">{o.tariff.name}</div>
                        </div>
                        <ColorBadge color={o.tariff.color} />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/[0.03] py-2 ring-1 ring-white/10">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">€/kWh</div>
                          <div className="text-sm font-semibold text-slate-100">{offerPrice(o).toFixed(3)}</div>
                        </div>
                        <div className="rounded-lg bg-white/[0.03] py-2 ring-1 ring-white/10">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">Πάγιο/μήνα</div>
                          <div className="text-sm font-semibold text-slate-100">{eur(o.tariff.fixed_monthly_eur)}</div>
                        </div>
                        <div className="rounded-lg bg-white/[0.03] py-2 ring-1 ring-white/10">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">Ετήσιο</div>
                          <div className="text-sm font-bold text-white">{eur(offerAnnual(o), 0)}</div>
                        </div>
                      </div>

                      {o.tariff.discount_condition && <p className="mt-2 text-xs text-slate-500">ℹ️ {o.tariff.discount_condition}</p>}

                      <div className="mt-3 flex items-center justify-between gap-3">
                        {o.savings !== null ? (
                          <span className={`text-sm font-semibold ${o.savings > 0 ? "text-emerald-300" : "text-slate-500"}`}>
                            {o.savings > 0 ? `▼ κερδίζεις ${eur(o.savings, 0)}/έτος` : `▲ ${eur(-o.savings, 0)}/έτος ακριβότερο`}
                          </span>
                        ) : <span />}
                        {o.tariff.url && <a href={o.tariff.url} target="_blank" rel="noreferrer" className={btnSmall}>Δες ↗</a>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <p className="mt-5 text-xs text-slate-500">
          Ποσά με ΦΠΑ 6%, μόνο χρεώσεις προμήθειας. Οι ρυθμιζόμενες χρεώσεις, οι δημοτικοί φόροι και η ΕΡΤ είναι ίδια σε
          όλους τους παρόχους. Η ετήσια κατανάλωση είναι γραμμική προέκταση της περιόδου του λογαριασμού.
          {updatedAt && <> Τιμές ενημερώθηκαν: {new Date(updatedAt).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" })}.</>}
        </p>
      </Card>
    </>
  );
}

/* ───────────── programmes per provider ───────────── */

function ProviderCatalog({ offers }: { offers: Offer[] | null }) {
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [color, setColor] = useState<ColorFilter>("all");

  useEffect(() => {
    fetch("/api/tariffs")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setTariffs(d.tariffs); setUpdatedAt(d.updated_at); })
      .catch(() => setFailed(true));
  }, []);

  // Annual cost for the uploaded bill's consumption, when there is one.
  const annualById = useMemo(() => new Map((offers ?? []).map((o) => [o.tariff.id, offerAnnual(o)])), [offers]);

  const groups = useMemo(() => {
    const byProvider = new Map<string, Tariff[]>();
    for (const t of tariffs ?? []) {
      if (color !== "all" && t.color !== color) continue;
      byProvider.set(t.provider, [...(byProvider.get(t.provider) ?? []), t]);
    }
    return [...byProvider.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "el"))
      .map(([provider, list]) => ({
        provider,
        byColor: COLORS.map((c) => ({ color: c, list: list.filter((t) => t.color === c).sort((a, b) => a.price_per_kwh_eur - b.price_per_kwh_eur) }))
          .filter((g) => g.list.length > 0),
        count: list.length,
      }));
  }, [tariffs, color]);

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${on ? "bg-cyan-400/15 text-cyan-200 ring-cyan-300/50" : "bg-white/5 text-slate-300 ring-white/15 hover:bg-white/10"}`;

  return (
    <Card
      id="providers"
      title="Προγράμματα ανά εταιρεία"
      subtitle={offers ? "Με το ετήσιο κόστος για τη δική σου κατανάλωση" : "Ανέβασε λογαριασμό για να δεις και το ετήσιο κόστος για σένα"}
    >
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={chip(color === "all")} onClick={() => setColor("all")}>Όλα τα χρώματα</button>
        {COLORS.map((c) => (
          <button key={c} type="button" className={chip(color === c)} onClick={() => setColor(c)}>
            {COLOR_INFO[c].emoji} {COLOR_INFO[c].label}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-400">Δεν φορτώθηκαν τα προγράμματα. Ανανέωσε τη σελίδα.</p>
      ) : !tariffs ? (
        <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
      ) : groups.length === 0 ? (
        <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-400">Κανένα πρόγραμμα σε αυτό το χρώμα.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {groups.map((g) => (
            <Accordion
              key={g.provider}
              summary={
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{g.provider}</div>
                    <div className="text-xs text-slate-400">{g.count} {g.count === 1 ? "πρόγραμμα" : "προγράμματα"}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {g.byColor.map((c) => <span key={c.color} title={COLOR_INFO[c.color].label}>{COLOR_INFO[c.color].emoji}</span>)}
                  </div>
                </div>
              }
            >
              <div className="space-y-4">
                {g.byColor.map((c) => (
                  <div key={c.color}>
                    <div className="flex items-center gap-2">
                      <ColorBadge color={c.color} />
                      <span className="text-xs text-slate-500">{COLOR_INFO[c.color].description}</span>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {c.list.map((t) => {
                        const annual = annualById.get(t.id);
                        return (
                          <li key={t.id} className="rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-100">{t.name}</div>
                                <div className="mt-0.5 text-xs text-slate-400">
                                  {(t.price_per_kwh_with_discount_eur ?? t.price_per_kwh_eur).toFixed(3)} €/kWh · πάγιο {eur(t.fixed_monthly_eur)}
                                  {t.min_duration_months ? ` · δέσμευση ${t.min_duration_months} μήνες` : ""}
                                </div>
                                {t.discount_condition && <div className="mt-0.5 text-xs text-slate-500">ℹ️ {t.discount_condition}</div>}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                {annual !== undefined && (
                                  <span className="whitespace-nowrap text-sm font-bold text-white">{eur(annual, 0)}<span className="text-[10px] font-normal text-slate-400">/έτος</span></span>
                                )}
                                {t.url && <a href={t.url} target="_blank" rel="noreferrer" className={btnSmall}>Δες ↗</a>}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Accordion>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Τιμές χωρίς ΦΠΑ, μόνο χρεώσεις προμήθειας{updatedAt && <> · ενημέρωση {new Date(updatedAt).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" })}</>}.
      </p>
    </Card>
  );
}

/* ───────────── how it works ───────────── */

function HowItWorks() {
  const steps = [
    { icon: "📄", title: "Ανεβάζεις τον λογαριασμό", text: "PDF ή φωτογραφία από οποιονδήποτε πάροχο ρεύματος." },
    { icon: "⚡", title: "Το Billi τον διαβάζει", text: "Βρίσκει κατανάλωση, πάγιο, τιμή kWh, εκπτώσεις και χρώμα τιμολογίου." },
    { icon: "💡", title: "Παίρνεις πρόταση", text: "Υπολογίζουμε το ετήσιο κόστος σε κάθε πρόγραμμα για τη δική σου κατανάλωση." },
  ];
  return (
    <section id="how" className="mt-10 scroll-mt-20">
      <h2 className="text-center text-xl font-semibold text-white">Πώς δουλεύει</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-lg ring-1 ring-white/10">{s.icon}</span>
              <span className="text-xs font-bold text-slate-500">ΒΗΜΑ {i + 1}</span>
            </div>
            <div className="mt-3 font-semibold text-white">{s.title}</div>
            <div className="mt-1 text-sm text-slate-400">{s.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <Accordion summary={<span className="text-sm font-semibold text-slate-200">Από πού είναι οι τιμές;</span>}>
          <p className="text-sm text-slate-400">
            Από τις μηνιαίες δημοσιεύσεις τιμολογίων των παρόχων (energycost.gr της ΡΑΑΕΥ και ειδησεογραφία). Πριν αλλάξεις
            πάροχο, έλεγξε την τρέχουσα τιμή στο site του παρόχου.
          </p>
        </Accordion>
        <Accordion summary={<span className="text-sm font-semibold text-slate-200">Γιατί μετράει μόνο η προμήθεια;</span>}>
          <p className="text-sm text-slate-400">
            Οι ρυθμιζόμενες χρεώσεις (δίκτυο, ΥΚΩ, ΕΤΜΕΑΡ), οι δημοτικοί φόροι και η ΕΡΤ είναι ίδιες σε όλους τους παρόχους.
            Η διαφορά ανάμεσα στα προγράμματα είναι μόνο στο πάγιο και στην τιμή της kWh.
          </p>
        </Accordion>
      </div>
    </section>
  );
}

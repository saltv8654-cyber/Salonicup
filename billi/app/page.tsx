"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Bill, Category, EnergyCategory, Tariff, TariffColor, TelecomBill, TelecomPlan } from "@/lib/types";
import { CATEGORY_INFO, COLOR_INFO } from "@/lib/types";
import { avgMonthly, compareTelecom, type TelecomComparison, type TelecomOffer, type TelecomSide } from "@/lib/telecom";
import { compare, reliability, type Comparison, type Offer } from "@/lib/compare";
import { sessionId, track, trafficSource } from "@/lib/track";
import { CookieSettingsLink } from "./consent";
import { BillBreakdown, PicksView, SaveToProfile, ScoreCard } from "./insights";
import { billiScore } from "@/lib/score";

const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE ?? "";
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Billi";

/** What the visitor wants to be contacted about; empty = general "call me". */
interface LeadTarget {
  tariff?: Tariff;
  plan?: TelecomPlan;
  annual?: number | null;
  savings?: number | null;
}
const LeadCtx = createContext<(t?: LeadTarget) => void>(() => {});

interface Result {
  bill: Bill;
  warnings: string[];
  comparison: Comparison | null;
  tariffs_updated_at: string | null;
  /** Estimated from a typed-in consumption instead of an uploaded bill. */
  manual?: { kwhMonth: number };
  category?: EnergyCategory;
}

interface TelecomResult {
  category: "telecom";
  telecom: TelecomBill | null;
  warnings: string[];
  telecomComparison: TelecomComparison;
  tariffs_updated_at: string | null;
  manual?: boolean;
}

/** One shared request per catalogue (used by the calculators and the per-provider lists). */
const catalogue = new Map<string, Promise<any>>();
function fetchOnce<T>(key: string, url: string): Promise<T> {
  if (!catalogue.has(key)) {
    catalogue.set(key, fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(key)))).catch((e) => {
      catalogue.delete(key);
      throw e;
    }));
  }
  return catalogue.get(key)!;
}
const getTariffs = (category: EnergyCategory = "electricity") =>
  fetchOnce<{ tariffs: Tariff[]; updated_at: string | null }>(`tariffs-${category}`, `/api/tariffs?category=${category}`);
const getPlans = () => fetchOnce<{ plans: TelecomPlan[]; updated_at: string | null }>("telecom", "/api/tariffs?category=telecom");

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
const btnWant =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110";
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
  const [telecomResult, setTelecomResult] = useState<TelecomResult | null>(null);
  const [category, setCategory] = useState<Category>("electricity");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [leadTarget, setLeadTarget] = useState<LeadTarget | null>(null);
  // The analysed file stays in the browser; it is uploaded only if the visitor ticks "attach" in the lead form.
  const [billFile, setBillFile] = useState<File | null>(null);

  useEffect(() => {
    track("page_view");
  }, []);

  const openLead = (t: LeadTarget = {}) => {
    const label = t.tariff ? `${t.tariff.provider} ${t.tariff.name}` : t.plan ? `${t.plan.provider} ${t.plan.name}` : null;
    track("lead_open", { tariff: label, category });
    setLeadTarget(t);
  };

  const step = result || telecomResult ? 3 : loading ? 2 : 1;
  const info = CATEGORY_INFO[category];

  function switchCategory(c: Category) {
    if (c === category) return;
    setCategory(c);
    setResult(null);
    setTelecomResult(null);
    setError(null);
    setBillFile(null);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function onFile(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    setTelecomResult(null);
    setBillFile(null);
    track("upload_start", { type: file.type || "unknown", category });
    try {
      const fd = new FormData();
      const sent = await shrinkImage(file);
      fd.append("file", sent);
      fd.append("category", category);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Σφάλμα");
      setBillFile(sent);
      if (json.category === "telecom") {
        setTelecomResult(json);
        track("analysis_ok", { provider: json.telecom?.provider ?? null, category: "telecom" });
        setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 50);
        return;
      }
      setResult(json);
      const rec = json.comparison?.recommendation ?? null;
      const recOffer = rec ? json.comparison.byColor?.[rec.color] : null;
      track("analysis_ok", {
        provider: json.bill?.provider ?? null,
        category,
        color: json.bill?.tariff_color ?? null,
        annual_kwh: json.comparison?.annualKwh ?? null,
        current_annual: json.comparison?.currentAnnual != null ? Math.round(json.comparison.currentAnnual) : null,
        recommended_color: rec?.color ?? null,
        best_savings: recOffer?.savings != null ? Math.round(recOffer.savings) : null,
      });
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e: any) {
      setError(e.message);
      track("analysis_error", { message: String(e.message).slice(0, 200) });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setTelecomResult(null);
    setBillFile(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <LeadCtx.Provider value={openLead}>
      <TopBar onNew={result || telecomResult ? reset : undefined} />

      <main className="relative mx-auto max-w-3xl px-4 pb-16 pt-6">
        <header className="flex flex-col items-center text-center">
          <h1><img src="/logo.png" alt="Billi — Know your bills. Save more." className="h-40 w-auto sm:h-52" /></h1>
          <div role="tablist" aria-label="Κατηγορία" className="mt-5 grid w-full max-w-md grid-cols-3 gap-1.5 rounded-2xl bg-white/[0.03] p-1.5 ring-1 ring-white/10">
            {(Object.keys(CATEGORY_INFO) as Category[]).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                type="button"
                onClick={() => switchCategory(c)}
                className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                  category === c ? "bg-gradient-to-r from-blue-500 via-cyan-500 to-violet-500 text-white shadow-lg shadow-blue-500/20" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span className="block text-lg leading-none">{CATEGORY_INFO[c].emoji}</span>
                <span className="mt-1 block">{CATEGORY_INFO[c].label}</span>
              </button>
            ))}
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
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-violet-500 text-2xl shadow-lg shadow-cyan-500/20">{info.emoji}</span>
                  <p className="mt-4 text-lg font-semibold text-white">Ανέβασε τον {info.bill}</p>
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
          <p className="mt-3 text-center text-xs text-slate-500">🔒 Το billi δεν αποθηκεύει τον λογαριασμό σου, εκτός αν το ζητήσεις στη φόρμα επικοινωνίας.</p>
        </section>

        <div key={`calc-${category}`}>
        {category === "telecom" ? (
          <TelecomCalc
            onResult={(r) => {
              setError(null);
              setBillFile(null);
              setTelecomResult(r);
              setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
          />
        ) : (
          <ManualCalc
            key={category}
            category={category}
            onResult={(r) => {
              setError(null);
              setBillFile(null);
              setResult(r);
              setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
          />
        )}
        </div>

        {error && (
          <div className="mt-6 flex items-start justify-between gap-3 rounded-xl bg-red-500/10 p-4 text-red-300 ring-1 ring-red-400/30">
            <span>⚠️ {error}</span>
            <button type="button" className={btnSmall} onClick={() => fileInput.current?.click()}>Δοκίμασε ξανά</button>
          </div>
        )}

        {result && (
          <div id="results" className="scroll-mt-20">
            {result.manual ? (
              <ManualSummary category={result.category ?? "electricity"} kwhMonth={result.manual.kwhMonth} bill={result.bill} annualKwh={result.comparison?.annualKwh ?? 0} onUpload={() => fileInput.current?.click()} />
            ) : (
              <BillSummary bill={result.bill} warnings={result.warnings} />
            )}
            {!result.manual && (result.category ?? "electricity") === "electricity" && <BillBreakdown bill={result.bill} />}
            {result.comparison && (result.category ?? "electricity") === "electricity" && (() => {
              const score = result.manual ? null : billiScore(result.comparison, result.bill);
              return (
                <>
                  {score && <ScoreCard s={score} />}
                  {result.comparison.picks && <PicksView c={result.comparison} onWant={openLead} />}
                  {!result.manual && <SaveToProfile bill={result.bill} />}
                </>
              );
            })()}
            {result.comparison && (
              <ComparisonView c={result.comparison} current={result.bill} updatedAt={result.tariffs_updated_at} category={result.category ?? "electricity"} />
            )}
            <div className="mt-8 flex justify-center">
              <button type="button" className={btnSecondary} onClick={reset}>↺ Ανάλυσε άλλον λογαριασμό</button>
            </div>
          </div>
        )}

        {telecomResult && (
          <div id="results" className="scroll-mt-20">
            <TelecomResults r={telecomResult} onUpload={() => fileInput.current?.click()} />
            <div className="mt-8 flex justify-center">
              <button type="button" className={btnSecondary} onClick={reset}>↺ Ανάλυσε άλλον λογαριασμό</button>
            </div>
          </div>
        )}

        {category === "telecom" ? (
          <TelecomCatalog offers={telecomResult ? [...(telecomResult.telecomComparison.internet?.offers ?? []), ...(telecomResult.telecomComparison.mobile?.offers ?? [])] : null} />
        ) : (
          <ProviderCatalog key={category} category={category} offers={result?.comparison?.offers ?? null} />
        )}

        <ContactSection />

        <HowItWorks />
      </main>

      <Footer />

      {leadTarget && <LeadModal target={leadTarget} result={result} telecomResult={telecomResult} category={category} billFile={billFile} onClose={() => setLeadTarget(null)} />}
    </LeadCtx.Provider>
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
    { id: "calc", icon: "🧮", label: "Υπολογισμός χωρίς λογαριασμό" },
    { id: "colors", icon: "🎨", label: "Ποιο χρώμα με συμφέρει" },
    { id: "compare", icon: "📊", label: "Σύγκριση παρόχων" },
    { id: "providers", icon: "🏢", label: "Προγράμματα ανά εταιρεία" },
    { id: "contact", icon: "📞", label: "Επικοινωνία" },
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
          <a href="/account" className={btnSmall} title="Ο λογαριασμός μου">👤<span className="hidden sm:inline"> Ο λογαριασμός μου</span></a>
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

/* ───────────── calculator without a bill ───────────── */

const PRESETS = [
  { label: "🏠 Μικρό σπίτι", kwh: 150 },
  { label: "🏢 Διαμέρισμα", kwh: 250 },
  { label: "👨‍👩‍👧 Οικογένεια", kwh: 400 },
  { label: "❄️ Με κλιματιστικά / θέρμανση", kwh: 700 },
];

const GAS_PRESETS = [
  { label: "🍳 Κουζίνα & ζεστό νερό", kwh: 1500 },
  { label: "🏢 Διαμέρισμα με θέρμανση", kwh: 5000 },
  { label: "👨‍👩‍👧 Οικογένεια", kwh: 8000 },
  { label: "🏡 Μονοκατοικία", kwh: 14000 },
];

/** Electricity asks kWh per month; gas asks kWh per year, because heating makes months too uneven. */
function ManualCalc({ onResult, category }: { onResult: (r: Result) => void; category: EnergyCategory }) {
  const gas = category === "gas";
  const presets = gas ? GAS_PRESETS : PRESETS;
  const [open, setOpen] = useState(false);
  const [kwh, setKwh] = useState(gas ? 5000 : 250);
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || tariffs) return;
    getTariffs(category).then((d) => { setTariffs(d.tariffs); setUpdatedAt(d.updated_at); }).catch(() => setFailed(true));
  }, [open, tariffs, category]);

  const providers = useMemo(() => [...new Set((tariffs ?? []).map((t) => t.provider))].sort((a, b) => a.localeCompare(b, "el")), [tariffs]);
  const programs = (tariffs ?? []).filter((t) => t.provider === provider);
  const current = programs.find((t) => t.id === currentId) ?? null;

  function calculate() {
    if (!tariffs) return;
    const bill: Bill = {
      provider: current?.provider ?? (provider || null),
      program_name: current?.name ?? null,
      tariff_color: current?.color ?? null,
      period_start: null, period_end: null,
      billing_days: 365,
      kwh_total: gas ? kwh : kwh * 12,
      kwh_day: null, kwh_night: null,
      kwh_rate: current ? current.price_per_kwh_with_discount_eur ?? current.price_per_kwh_eur : null,
      kwh_rate_night: null,
      fixed_monthly_fee: current?.fixed_monthly_eur ?? null,
      energy_charge_gross: null, consistency_discount: null, net_energy_charge: null,
      supplier_total: null, regulated_total: null, municipal_total: null, efk_total: null, vat_amount: null, total_due: null,
      is_estimate: true,
    };
    const comparison = compare(bill, tariffs, category);
    track("manual_calc", { kwh_month: gas ? Math.round(kwh / 12) : kwh, provider: bill.provider, program: bill.program_name, category });
    onResult({ bill, warnings: [], comparison, tariffs_updated_at: updatedAt, manual: { kwhMonth: gas ? Math.round(kwh / 12) : kwh }, category });
  }

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${on ? "bg-cyan-400/15 text-cyan-200 ring-cyan-300/50" : "bg-white/5 text-slate-300 ring-white/15 hover:bg-white/10"}`;

  return (
    <section id="calc" className="mt-4 scroll-mt-20">
      <div className={`rounded-2xl ring-1 transition ${open ? "bg-white/[0.03] ring-white/15" : "bg-white/[0.02] ring-white/10"}`}>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
          <div>
            <div className="font-semibold text-white">🧮 Δεν έχεις τον {CATEGORY_INFO[category].bill} πρόχειρο;</div>
            <div className="text-sm text-slate-400">Υπολόγισε με την κατανάλωσή σου, σε 10 δευτερόλεπτα</div>
          </div>
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 transition ${open ? "rotate-180" : ""}`}>▾</span>
        </button>

        {open && (
          <div className="border-t border-white/10 p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gas ? "Πόσο αέριο καις τον χρόνο;" : "Πόσο καις τον μήνα;"}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((p) => (
                <button key={p.kwh} type="button" className={chip(kwh === p.kwh)} onClick={() => setKwh(p.kwh)}>{p.label} · {p.kwh}</button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <input
                type="range" min={gas ? 300 : 30} max={gas ? 30000 : 1500} step={gas ? 100 : 10} value={kwh}
                onChange={(e) => setKwh(Number(e.target.value))}
                className="h-2 w-full cursor-pointer accent-cyan-400"
                aria-label={gas ? "kWh τον χρόνο" : "kWh τον μήνα"}
              />
              <label className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0a1028] px-3 py-2 ring-1 ring-white/15">
                <input
                  type="number" inputMode="numeric" min={1} max={gas ? 60000 : 5000} value={kwh}
                  onChange={(e) => setKwh(Math.max(1, Math.min(gas ? 60000 : 5000, Number(e.target.value) || 0)))}
                  className="w-16 bg-transparent text-right text-sm font-semibold text-white focus:outline-none"
                />
                <span className="text-xs text-slate-400">{gas ? "kWh/έτος" : "kWh/μήνα"}</span>
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {gas
                ? "Το βρίσκεις αθροίζοντας τις kWh (όχι τα m³) των λογαριασμών ενός χρόνου. Ένα διαμέρισμα με θέρμανση καίει συνήθως 4.000–7.000 kWh."
                : `≈ ${(kwh * 12).toLocaleString("el-GR")} kWh τον χρόνο. Τη βρίσκεις στον λογαριασμό ως «Κατανάλωση», διαιρεμένη με τους μήνες της περιόδου.`}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Πάροχος σήμερα (προαιρετικό)</span>
                <span className="relative mt-1 block">
                  <select
                    className="w-full appearance-none rounded-xl bg-[#0a1028] py-2.5 pl-3 pr-9 text-sm text-slate-100 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                    value={provider}
                    onChange={(e) => { setProvider(e.target.value); setCurrentId(""); }}
                  >
                    <option value="">Δεν ξέρω / άλλος</option>
                    {providers.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Πρόγραμμα σήμερα (προαιρετικό)</span>
                <span className="relative mt-1 block">
                  <select
                    disabled={!provider}
                    className="w-full appearance-none rounded-xl bg-[#0a1028] py-2.5 pl-3 pr-9 text-sm text-slate-100 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:opacity-50"
                    value={currentId}
                    onChange={(e) => setCurrentId(e.target.value)}
                  >
                    <option value="">Δεν ξέρω</option>
                    {programs.map((t) => <option key={t.id} value={t.id}>{COLOR_INFO[t.color].emoji} {t.name}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
                </span>
              </label>
            </div>

            {failed && <p className="mt-3 text-sm text-red-300">Δεν φορτώθηκαν οι τιμές. Ανανέωσε τη σελίδα.</p>}
            {tariffs && tariffs.length === 0 && (
              <p className="mt-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200 ring-1 ring-amber-300/20">
                Οι τιμές {gas ? "αερίου" : ""} ενημερώνονται αυτές τις μέρες. Μέχρι τότε, πάτα «Να με καλέσετε» και ένας σύμβουλος θα σου πει τι σε συμφέρει.
              </p>
            )}
            <button type="button" disabled={!tariffs} onClick={calculate} className={`${btnPrimary} mt-5 w-full`}>
              {tariffs ? "⚡ Δες τι σε συμφέρει" : "Φόρτωση τιμών…"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ManualSummary({ kwhMonth, bill, annualKwh, onUpload, category }: { kwhMonth: number; bill: Bill; annualKwh: number; onUpload: () => void; category: EnergyCategory }) {
  return (
    <Card title="Ο υπολογισμός σου">
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Κατανάλωση" value={`${kwhMonth.toLocaleString("el-GR")} kWh/μήνα${category === "gas" ? " (μ.ό.)" : ""}`} />
        <Stat label="Ανά έτος" value={`${annualKwh.toLocaleString("el-GR")} kWh`} />
      </div>
      {bill.provider && (
        <div className="mt-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm ring-1 ring-white/10">
          <span className="text-slate-400">Σήμερα: </span>
          <span className="font-semibold text-white">{bill.provider}{bill.program_name ? ` · ${bill.program_name}` : ""}</span>
          {bill.tariff_color && <span className="ml-2"><ColorBadge color={bill.tariff_color} /></span>}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Εκτίμηση με τις δημοσιευμένες τιμές{bill.program_name ? " του προγράμματός σου" : ""}. Για ακριβή σύγκριση με τις δικές σου
        χρεώσεις και εκπτώσεις, ανέβασε τον λογαριασμό.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" className={btnSecondary} onClick={onUpload}>📄 Ανέβασε λογαριασμό για ακρίβεια</button>
        <button type="button" className={btnSecondary} onClick={() => document.getElementById("calc")?.scrollIntoView({ behavior: "smooth" })}>✏️ Άλλαξε κατανάλωση</button>
      </div>
    </Card>
  );
}

/* ───────────── internet & mobile ───────────── */

const planSpec = (p: TelecomPlan) =>
  p.kind === "internet"
    ? [p.speed_mbps ? `${p.speed_mbps} Mbps` : null, p.tech].filter(Boolean).join(" · ")
    : p.data_gb !== undefined ? `${p.data_gb.toLocaleString("el-GR")} GB` : "Απεριόριστα data";

const priceLine = (p: TelecomPlan) =>
  p.promo_eur !== undefined && p.promo_months
    ? `${eur(p.promo_eur)} για ${p.promo_months} μήνες, μετά ${eur(p.monthly_eur)}`
    : `${eur(p.monthly_eur)}/μήνα`;

const SPEEDS = [50, 100, 200, 300, 500, 1000];
const DATA = [5, 20, 50, 80];

function TelecomCalc({ onResult }: { onResult: (r: TelecomResult) => void }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<TelecomPlan[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [wantInternet, setWantInternet] = useState(true);
  const [speed, setSpeed] = useState<number | null>(100);
  const [internetNow, setInternetNow] = useState("");
  const [wantMobile, setWantMobile] = useState(false);
  const [data, setData] = useState<number | "unlimited" | null>(20);
  const [mobileNow, setMobileNow] = useState("");

  useEffect(() => {
    if (!open || plans) return;
    getPlans().then((d) => { setPlans(d.plans); setUpdatedAt(d.updated_at); }).catch(() => setFailed(true));
  }, [open, plans]);

  const money = (v: string) => (v.trim() ? Number(v.replace(",", ".")) || null : null);
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${on ? "bg-cyan-400/15 text-cyan-200 ring-cyan-300/50" : "bg-white/5 text-slate-300 ring-white/15 hover:bg-white/10"}`;

  function calculate() {
    if (!plans) return;
    const telecomComparison = compareTelecom(plans, {
      internet: wantInternet ? { needs: { minSpeed: speed, minDataGb: null, needUnlimitedData: false }, current: money(internetNow) } : null,
      mobile: wantMobile
        ? { needs: { minSpeed: null, minDataGb: typeof data === "number" ? data : null, needUnlimitedData: data === "unlimited" }, current: money(mobileNow) }
        : null,
    });
    track("manual_calc", { category: "telecom", speed: wantInternet ? speed : null, data: wantMobile ? String(data) : null });
    onResult({ category: "telecom", telecom: null, warnings: [], telecomComparison, tariffs_updated_at: updatedAt, manual: true });
  }

  const moneyInput = (v: string, set: (v: string) => void) => (
    <label className="flex items-center gap-1.5 rounded-xl bg-[#0a1028] px-3 py-2 ring-1 ring-white/15">
      <span className="text-xs text-slate-400">Πληρώνω σήμερα</span>
      <input inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} placeholder="προαιρετικό" className="w-24 bg-transparent text-right text-sm font-semibold text-white placeholder:font-normal placeholder:text-slate-600 focus:outline-none" />
      <span className="text-xs text-slate-400">€/μήνα</span>
    </label>
  );

  return (
    <section id="calc" className="mt-4 scroll-mt-20">
      <div className={`rounded-2xl ring-1 transition ${open ? "bg-white/[0.03] ring-white/15" : "bg-white/[0.02] ring-white/10"}`}>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
          <div>
            <div className="font-semibold text-white">🧮 Δεν έχεις τον λογαριασμό πρόχειρο;</div>
            <div className="text-sm text-slate-400">Πες μας τι χρειάζεσαι, σε 10 δευτερόλεπτα</div>
          </div>
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 transition ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        {open && (
          <div className="space-y-4 border-t border-white/10 p-4 sm:p-5">
            <div className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/10">
              <label className="flex items-center gap-2.5 font-semibold text-white">
                <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={wantInternet} onChange={(e) => setWantInternet(e.target.checked)} /> 🏠 Internet σπιτιού
              </label>
              {wantInternet && (
                <div className="mt-3 space-y-3">
                  <div className="text-xs text-slate-400">Τι ταχύτητα θέλεις τουλάχιστον;</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={chip(speed === null)} onClick={() => setSpeed(null)}>Δεν ξέρω</button>
                    {SPEEDS.map((v) => <button key={v} type="button" className={chip(speed === v)} onClick={() => setSpeed(v)}>{v >= 1000 ? "1 Gbps" : `${v} Mbps`}</button>)}
                  </div>
                  {moneyInput(internetNow, setInternetNow)}
                </div>
              )}
            </div>
            <div className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/10">
              <label className="flex items-center gap-2.5 font-semibold text-white">
                <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={wantMobile} onChange={(e) => setWantMobile(e.target.checked)} /> 📱 Κινητή
              </label>
              {wantMobile && (
                <div className="mt-3 space-y-3">
                  <div className="text-xs text-slate-400">Πόσα data χρειάζεσαι τον μήνα;</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={chip(data === null)} onClick={() => setData(null)}>Δεν ξέρω</button>
                    {DATA.map((v) => <button key={v} type="button" className={chip(data === v)} onClick={() => setData(v)}>{v} GB</button>)}
                    <button type="button" className={chip(data === "unlimited")} onClick={() => setData("unlimited")}>Απεριόριστα</button>
                  </div>
                  {moneyInput(mobileNow, setMobileNow)}
                </div>
              )}
            </div>
            {failed && <p className="text-sm text-red-300">Δεν φορτώθηκαν οι τιμές. Ανανέωσε τη σελίδα.</p>}
            <button type="button" disabled={!plans || (!wantInternet && !wantMobile)} onClick={calculate} className={`${btnPrimary} w-full`}>
              {plans ? "⚡ Δες τι σε συμφέρει" : "Φόρτωση τιμών…"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function TelecomOfferCard({ o, recommended }: { o: TelecomOffer; recommended: boolean }) {
  const want = useContext(LeadCtx);
  const p = o.plan;
  return (
    <li className={`rounded-xl p-4 ring-1 transition ${recommended ? "bg-cyan-400/[0.07] ring-cyan-300/50" : o.fits ? "bg-white/[0.02] ring-white/10 hover:ring-white/20" : "bg-white/[0.01] opacity-60 ring-white/5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{p.provider}</span>
            {recommended && <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">✦ Πρόταση</span>}
            {!o.fits && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{p.kind === "internet" ? "πιο αργό" : "λιγότερα data"}</span>}
          </div>
          <div className="text-sm text-slate-400">{p.name} · {planSpec(p)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="whitespace-nowrap text-lg font-bold text-white">{eur(o.avgMonthly)}<span className="text-xs font-normal text-slate-400">/μήνα</span></div>
          <div className="text-[10px] text-slate-500">μέσος όρος 24 μηνών</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">💶 {priceLine(p)}{p.commitment_months ? ` · δέσμευση ${p.commitment_months} μήνες` : ""}</p>
      {p.notes && <p className="mt-1 text-xs text-slate-500">ℹ️ {p.notes}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        {o.savingsMonthly !== null ? (
          <span className={`text-sm font-semibold ${o.savingsMonthly > 0 ? "text-emerald-300" : "text-slate-500"}`}>
            {o.savingsMonthly > 0 ? `▼ κερδίζεις ${eur(o.savingsMonthly)}/μήνα` : `▲ ${eur(-o.savingsMonthly)}/μήνα ακριβότερο`}
          </span>
        ) : <span />}
        <div className="flex gap-2">
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" className={btnSmall} onClick={() => track("tariff_click", { tariff: `${p.provider} ${p.name}`, category: "telecom" })}>Δες ↗</a>}
          <button type="button" className={btnWant} onClick={() => want({ plan: p, annual: o.avgMonthly * 12, savings: o.savingsMonthly !== null ? o.savingsMonthly * 12 : null })}>Θέλω αυτό</button>
        </div>
      </div>
    </li>
  );
}

function TelecomSideView({ side }: { side: TelecomSide }) {
  const want = useContext(LeadCtx);
  const [showAll, setShowAll] = useState(false);
  const title = side.kind === "internet" ? "🏠 Internet σπιτιού" : "📱 Κινητή";
  const fitting = side.offers.filter((o) => o.fits);
  const shown = showAll ? side.offers : fitting.slice(0, 5);
  return (
    <Card title={title} subtitle={side.current !== null ? <>Σήμερα πληρώνεις <strong className="text-slate-200">{eur(side.current)}</strong>/μήνα</> : undefined}>
      {side.best ? (
        <div className="gradient-border mt-4 rounded-xl">
          <div className="rounded-xl bg-[#081028] p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-gradient">✦ Πρόταση Billi</div>
            <div className="mt-1.5 text-lg font-semibold text-white">{side.best.plan.provider} · {side.best.plan.name}</div>
            <div className="text-sm text-slate-400">{planSpec(side.best.plan)}</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {side.reasons.map((r) => <li key={r} className="flex gap-2"><span className="text-cyan-300">•</span><span>{r}</span></li>)}
            </ul>
            <button
              type="button"
              className={`${btnPrimary} mt-4 w-full`}
              onClick={() => want({ plan: side.best!.plan, annual: side.best!.avgMonthly * 12, savings: side.best!.savingsMonthly !== null ? side.best!.savingsMonthly * 12 : null })}
            >
              ✋ Θέλω αυτό το πρόγραμμα
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-400">
          {side.offers.length ? "Κανένα πρόγραμμα δεν καλύπτει αυτό που χρειάζεσαι. Δες τα υπόλοιπα παρακάτω." : "Δεν υπάρχουν ακόμα τιμές."}
        </p>
      )}
      {side.offers.length > 0 && (
        <>
          <ul className="mt-4 space-y-3">
            {shown.map((o) => <TelecomOfferCard key={o.plan.id} o={o} recommended={o.plan.id === side.best?.plan.id} />)}
          </ul>
          {side.offers.length > shown.length || showAll ? (
            <button type="button" className="mt-3 text-xs font-semibold text-cyan-300 underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Μόνο όσα καλύπτουν τις ανάγκες σου" : `Όλα τα προγράμματα (${side.offers.length})`}
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

function TelecomResults({ r, onUpload }: { r: TelecomResult; onUpload: () => void }) {
  const b = r.telecom;
  const sides = [r.telecomComparison.internet, r.telecomComparison.mobile].filter((x): x is TelecomSide => !!x);
  return (
    <>
      {b ? (
        <Card title="Ο λογαριασμός σου">
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-blue-500/15 via-cyan-400/10 to-violet-500/15 px-4 py-3 ring-1 ring-white/10">
            <div className="min-w-0">
              <div className="truncate font-semibold text-white">{b.provider ?? "Άγνωστος πάροχος"}</div>
              <div className="truncate text-xs text-slate-400">{b.plan_name ?? ""}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Σύνολο</div>
              <div className="whitespace-nowrap text-2xl font-bold text-white">{eur(b.total_due)}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {b.has_internet && <Stat label="Internet" value={`${b.internet_speed_mbps ? `${b.internet_speed_mbps} Mbps` : "—"} · ${eur(b.internet_monthly_eur)}`} />}
            {b.has_mobile && <Stat label={`Κινητή${b.mobile_lines && b.mobile_lines > 1 ? ` (${b.mobile_lines} γραμμές)` : ""}`} value={`${b.mobile_unlimited_data ? "Απεριόριστα" : b.mobile_data_gb ? `${b.mobile_data_gb} GB` : "—"} · ${eur(b.mobile_monthly_eur)}`} />}
          </div>
          {r.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200 ring-1 ring-amber-300/20">
              {r.warnings.map((w) => <li key={w}>⚠️ {w}</li>)}
            </ul>
          )}
        </Card>
      ) : (
        <Card title="Ο υπολογισμός σου">
          <p className="mt-2 text-sm text-slate-400">Σύγκριση με βάση αυτό που μας είπες ότι χρειάζεσαι. Για σύγκριση με τις δικές σου χρεώσεις, ανέβασε τον λογαριασμό.</p>
          <button type="button" className={`${btnSecondary} mt-3`} onClick={onUpload}>📄 Ανέβασε λογαριασμό για ακρίβεια</button>
        </Card>
      )}
      {sides.map((s) => <TelecomSideView key={s.kind} side={s} />)}
      <p className="mt-4 text-xs text-slate-500">
        Τιμές με ΦΠΑ, όπως τις διαφημίζουν οι πάροχοι. Η σύγκριση γίνεται με τον μέσο όρο 24 μηνών, ώστε να μετράνε σωστά οι
        προσφορές των πρώτων μηνών. Η διαθεσιμότητα οπτικής ίνας εξαρτάται από τη διεύθυνση.
        {r.tariffs_updated_at && <> Τιμές: {new Date(r.tariffs_updated_at).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" })}.</>}
      </p>
    </>
  );
}

function TelecomCatalog({ offers }: { offers: TelecomOffer[] | null }) {
  const want = useContext(LeadCtx);
  const [plans, setPlans] = useState<TelecomPlan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<"all" | "internet" | "mobile">("all");
  useEffect(() => { getPlans().then((d) => setPlans(d.plans)).catch(() => setFailed(true)); }, []);
  const byId = useMemo(() => new Map((offers ?? []).map((o) => [o.plan.id, o])), [offers]);

  const groups = useMemo(() => {
    const list = (plans ?? []).filter((p) => kind === "all" || p.kind === kind);
    const providers = [...new Set(list.map((p) => p.provider))].sort((a, b) => a.localeCompare(b, "el"));
    return providers.map((pr) => ({
      provider: pr,
      internet: list.filter((p) => p.provider === pr && p.kind === "internet").sort((a, b) => (a.speed_mbps ?? 0) - (b.speed_mbps ?? 0)),
      mobile: list.filter((p) => p.provider === pr && p.kind === "mobile").sort((a, b) => avgMonthly(a) - avgMonthly(b)),
    }));
  }, [plans, kind]);

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${on ? "bg-cyan-400/15 text-cyan-200 ring-cyan-300/50" : "bg-white/5 text-slate-300 ring-white/15 hover:bg-white/10"}`;

  const row = (p: TelecomPlan) => {
    const o = byId.get(p.id);
    return (
      <li key={p.id} className="rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100">{p.name}</div>
            <div className="mt-0.5 text-xs text-slate-400">{planSpec(p)} · {priceLine(p)}</div>
            {p.notes && <div className="mt-0.5 text-xs text-slate-500">ℹ️ {p.notes}</div>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="whitespace-nowrap text-sm font-bold text-white">{eur(avgMonthly(p))}<span className="text-[10px] font-normal text-slate-400">/μήνα</span></span>
            <div className="flex gap-1.5">
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className={btnSmall} onClick={() => track("tariff_click", { tariff: `${p.provider} ${p.name}`, category: "telecom" })}>Δες ↗</a>}
              <button type="button" className={btnWant} onClick={() => want({ plan: p, annual: avgMonthly(p) * 12, savings: o?.savingsMonthly != null ? o.savingsMonthly * 12 : null })}>Θέλω αυτό</button>
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <Card id="providers" title="Προγράμματα ανά εταιρεία" subtitle="Internet σπιτιού και κινητή, μέσο κόστος 24 μηνών με ΦΠΑ">
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={chip(kind === "all")} onClick={() => setKind("all")}>Όλα</button>
        <button type="button" className={chip(kind === "internet")} onClick={() => setKind("internet")}>🏠 Internet</button>
        <button type="button" className={chip(kind === "mobile")} onClick={() => setKind("mobile")}>📱 Κινητή</button>
      </div>
      {failed ? (
        <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-400">Δεν φορτώθηκαν τα προγράμματα. Ανανέωσε τη σελίδα.</p>
      ) : !plans ? (
        <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
      ) : (
        <div className="mt-4 space-y-2">
          {groups.map((g) => (
            <Accordion
              key={g.provider}
              summary={
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{g.provider}</div>
                    <div className="text-xs text-slate-400">{g.internet.length + g.mobile.length} προγράμματα</div>
                  </div>
                  <div className="flex gap-1">{g.internet.length > 0 && <span title="Internet">🏠</span>}{g.mobile.length > 0 && <span title="Κινητή">📱</span>}</div>
                </div>
              }
            >
              <div className="space-y-4">
                {g.internet.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">🏠 Internet σπιτιού</div>
                    <ul className="mt-2 space-y-2">{g.internet.map(row)}</ul>
                  </div>
                )}
                {g.mobile.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">📱 Κινητή</div>
                    <ul className="mt-2 space-y-2">{g.mobile.map(row)}</ul>
                  </div>
                )}
              </div>
            </Accordion>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">Ενδεικτικές τιμές όπως τις διαφημίζουν οι πάροχοι. Έλεγξε τη διαθεσιμότητα για τη διεύθυνσή σου.</p>
    </Card>
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

function ComparisonView({ c, current, updatedAt, category = "electricity" }: { c: Comparison; current: Bill; updatedAt: string | null; category?: EnergyCategory }) {
  // Gas has no dynamic (orange) tariffs.
  const colors: TariffColor[] = category === "gas" ? ["blue", "green", "yellow"] : COLORS;
  const want = useContext(LeadCtx);
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
        {c.recommendation && !(c.picks?.length) && (
          <div className="gradient-border mt-5 rounded-xl">
            <div className="rounded-xl bg-[#081028] p-4 sm:p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-gradient">✦ Πρόταση Billi</div>
              <div className="mt-1.5 text-lg font-semibold text-white">{COLOR_INFO[c.recommendation.color].emoji} {c.recommendation.text}</div>

              {recommended && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{recommended.tariff.provider} · {recommended.tariff.name}</div>
                    <div className="text-xs text-slate-400">{offerPrice(recommended).toFixed(3)} €/kWh · πάγιο {eur(recommended.tariff.fixed_monthly_eur)}</div>
                    <TariffReliability t={recommended.tariff} />
                  </div>
                  <div className="text-right">
                    <div className="whitespace-nowrap text-xl font-bold text-white">{eur(offerAnnual(recommended), 0)}<span className="text-xs font-normal text-slate-400">/έτος</span></div>
                    <div className="text-xs text-slate-400">~{eur(offerAnnual(recommended) / 12, 0)}/μήνα</div>
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
                {recommended && (
                  <button type="button" className={btnPrimary} onClick={() => want({ tariff: recommended.tariff, annual: offerAnnual(recommended), savings: recommended.savings })}>
                    ✋ Θέλω αυτό το πρόγραμμα
                  </button>
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
          {colors.map((col) => {
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
                options={[{ value: "all", label: "Όλα" }, ...colors.map((x) => ({ value: x, label: `${COLOR_INFO[x].emoji} ${COLOR_INFO[x].label}` }))]}
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
                          <div className="text-[10px] text-slate-500">~{eur(offerAnnual(o) / 12, 0)}/μήνα</div>
                        </div>
                      </div>

                      {o.tariff.discount_condition && <p className="mt-2 text-xs text-slate-500">ℹ️ {o.tariff.discount_condition}</p>}
                      <TariffDetails t={o.tariff} />
                      <TariffReliability t={o.tariff} />

                      <div className="mt-3 flex items-center justify-between gap-3">
                        {o.savings !== null ? (
                          <span className={`text-sm font-semibold ${o.savings > 0 ? "text-emerald-300" : "text-slate-500"}`}>
                            {o.savings > 0 ? `▼ κερδίζεις ${eur(o.savings, 0)}/έτος` : `▲ ${eur(-o.savings, 0)}/έτος ακριβότερο`}
                          </span>
                        ) : <span />}
                        <div className="flex gap-2">
                          {o.tariff.url && (
                            <a href={o.tariff.url} target="_blank" rel="noreferrer" className={btnSmall}
                              onClick={() => track("tariff_click", { tariff: `${o.tariff.provider} ${o.tariff.name}` })}>Δες ↗</a>
                          )}
                          <button type="button" className={btnWant} onClick={() => want({ tariff: o.tariff, annual: offerAnnual(o), savings: o.savings })}>Θέλω αυτό</button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <details className="group mt-5 rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/10">
          <summary className="cursor-pointer list-none text-xs font-semibold text-slate-300">
            🧮 Πώς υπολογίστηκε <span className="text-slate-500 group-open:hidden">▾</span><span className="hidden text-slate-500 group-open:inline">▴</span>
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {(c.assumptions ?? []).map((a) => <li key={a} className="flex gap-2"><span className="text-cyan-300">•</span><span>{a}</span></li>)}
          </ul>
        </details>
        <p className="mt-3 text-xs text-slate-500">
          Ποσά με ΦΠΑ 6%, μόνο χρεώσεις προμήθειας.
          {updatedAt && <> Τιμές ενημερώθηκαν: {new Date(updatedAt).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" })}.</>}
        </p>
      </Card>
    </>
  );
}

const shortDay = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("el-GR", { timeZone: "Europe/Athens", day: "numeric", month: "numeric", year: "2-digit" });

/** Night price, promotions and contract terms, when the provider publishes them. */
function TariffDetails({ t }: { t: Tariff }) {
  const bits = [
    t.day_night && t.price_per_kwh_night_eur !== undefined ? `🌙 νύχτα ${t.price_per_kwh_night_eur.toFixed(3)} €/kWh` : null,
    t.promo_discount ? `🎁 ${t.promo_discount}` : null,
    t.min_duration_months ? `📄 διάρκεια ${t.min_duration_months} μήνες` : null,
    t.early_termination_fee ? `⚠️ πρόωρη λήξη: ${t.early_termination_fee}` : null,
    t.conditions ? `ℹ️ ${t.conditions}` : null,
  ].filter(Boolean) as string[];
  if (bits.length === 0) return null;
  return <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500">{bits.map((b) => <li key={b}>{b}</li>)}</ul>;
}

/** Is this price confirmed? Never present an indicative or expired price as a confirmed one. */
function TariffReliability({ t }: { t: Tariff }) {
  const { expired, unverified } = reliability(t);
  const until = t.valid_until ? ` · ισχύει έως ${shortDay(t.valid_until)}` : "";
  if (expired) {
    return <p className="mt-2 inline-block rounded-lg bg-red-500/10 px-2 py-1 text-[11px] text-red-300 ring-1 ring-red-400/30">⛔ Η ισχύς του προγράμματος έληξε στις {shortDay(t.valid_until!)}. Επιβεβαίωσε την τιμή με τον πάροχο.</p>;
  }
  if (unverified) {
    return (
      <p className="mt-2 inline-block rounded-lg bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200 ring-1 ring-amber-300/30">
        ⚠️ Ενδεικτική τιμή: {t.last_verified_at ? `τελευταία επιβεβαίωση ${shortDay(t.last_verified_at)}` : "δεν έχει επιβεβαιωθεί από την πηγή"}{until}
      </p>
    );
  }
  return <p className="mt-2 text-[11px] text-emerald-300/80">✓ Επιβεβαιώθηκε από την πηγή στις {shortDay(t.last_verified_at!)}{until}</p>;
}

/* ───────────── programmes per provider ───────────── */

function ProviderCatalog({ offers, category }: { offers: Offer[] | null; category: EnergyCategory }) {
  const want = useContext(LeadCtx);
  const offerById = useMemo(() => new Map((offers ?? []).map((o) => [o.tariff.id, o])), [offers]);
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [color, setColor] = useState<ColorFilter>("all");

  useEffect(() => {
    getTariffs(category)
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
        {COLORS.filter((c) => category !== "gas" || c !== "orange").map((c) => (
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
        <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-400">
          {tariffs.length === 0
            ? "Οι τιμές ενημερώνονται αυτές τις μέρες. Μέχρι τότε, πάτα «Να με καλέσετε» και ένας σύμβουλος θα σου πει τι σε συμφέρει."
            : "Κανένα πρόγραμμα σε αυτό το χρώμα."}
        </p>
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
                                <TariffDetails t={{ ...t, min_duration_months: undefined }} />
                                <TariffReliability t={t} />
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                {annual !== undefined && (
                                  <span className="whitespace-nowrap text-sm font-bold text-white">{eur(annual, 0)}<span className="text-[10px] font-normal text-slate-400">/έτος</span></span>
                                )}
                                <div className="flex gap-1.5">
                                  {t.url && (
                                    <a href={t.url} target="_blank" rel="noreferrer" className={btnSmall}
                                      onClick={() => track("tariff_click", { tariff: `${t.provider} ${t.name}` })}>Δες ↗</a>
                                  )}
                                  <button type="button" className={btnWant}
                                    onClick={() => want({ tariff: t, annual: annual ?? null, savings: offerById.get(t.id)?.savings ?? null })}>
                                    Θέλω αυτό
                                  </button>
                                </div>
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

/* ───────────── lead form ───────────── */

const SERVICES = ["Αλλαγή παρόχου ρεύματος", "Αλλαγή παρόχου φυσικού αερίου", "Internet / κινητή", "Έλεγχος λογαριασμού", "Άλλο"];
const PREFERRED_TIMES = ["Οποιαδήποτε ώρα", "Πρωί (9–12)", "Μεσημέρι (12–15)", "Απόγευμα (15–18)", "Βράδυ (18–21)"];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl bg-[#0a1028] px-3 py-2.5 text-sm text-slate-100 ring-1 ring-white/15 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400/60";

function LeadModal({ target, result, telecomResult, category, billFile, onClose }: {
  target: LeadTarget; result: Result | null; telecomResult: TelecomResult | null; category: Category; billFile: File | null; onClose: () => void;
}) {
  const defaultService = category === "gas" ? "Αλλαγή παρόχου φυσικού αερίου" : category === "telecom" ? "Internet / κινητή" : "Αλλαγή παρόχου ρεύματος";
  const [form, setForm] = useState({ name: "", phone: "", email: "", preferred_time: PREFERRED_TIMES[0], requested_service: defaultService, message: "", consent_contact: false, consent_marketing: false, website: "" });
  const [attach, setAttach] = useState(false);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const bill = category === "telecom" ? null : result?.bill ?? null;
  const c = category === "telecom" ? null : result?.comparison ?? null;
  const tb = category === "telecom" ? telecomResult?.telecom ?? null : null;
  const t = target.tariff;
  const plan = target.plan;
  const label = t ? `${t.provider} ${t.name}` : plan ? `${plan.provider} ${plan.name}` : null;
  const currentProvider = bill?.provider ?? tb?.provider ?? null;
  const currentProgram = bill?.program_name ?? tb?.plan_name ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          context: {
            tariff_id: t?.id ?? plan?.id ?? null,
            tariff_label: label ? `${CATEGORY_INFO[category].emoji} ${label}` : null,
            current_provider: currentProvider,
            current_program: currentProgram,
            annual_kwh: c?.annualKwh ?? null,
            current_annual: c?.currentAnnual !== undefined && c?.currentAnnual !== null ? Math.round(c.currentAnnual * 100) / 100 : null,
            offer_annual: target.annual != null ? Math.round(target.annual * 100) / 100 : null,
            savings: target.savings != null ? Math.round(target.savings * 100) / 100 : null,
            bill: bill
              ? {
                  category,
                  tariff_color: bill.tariff_color, period: bill.period_start && bill.period_end ? `${bill.period_start} – ${bill.period_end}` : null,
                  kwh_total: bill.kwh_total, billing_days: bill.billing_days, fixed_monthly_fee: bill.fixed_monthly_fee,
                  kwh_rate: bill.kwh_rate, supplier_total: bill.supplier_total, total_due: bill.total_due,
                }
              : tb
                ? {
                    category, internet_speed_mbps: tb.internet_speed_mbps, internet_monthly_eur: tb.internet_monthly_eur,
                    mobile_lines: tb.mobile_lines, mobile_data_gb: tb.mobile_data_gb, mobile_unlimited_data: tb.mobile_unlimited_data,
                    mobile_monthly_eur: tb.mobile_monthly_eur, total_due: tb.total_due,
                  }
                : { category },
          },
          source: trafficSource(),
          session_id: sessionId() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Κάτι πήγε στραβά");
      if (attach && billFile && json.id && json.attach_token) {
        const fd = new FormData();
        fd.append("token", json.attach_token);
        fd.append("file", billFile);
        const up = await fetch(`/api/leads/${json.id}/attachment`, { method: "POST", body: fd }).catch(() => null);
        if (!up?.ok) {
          const e = await up?.json().catch(() => ({}));
          setAttachNote(`Το αίτημα στάλθηκε, αλλά ο λογαριασμός δεν επισυνάφθηκε${e?.error ? ` (${e.error})` : ""}. Θα σου τον ζητήσουμε στο τηλέφωνο.`);
        }
      }
      track("lead_submit", { tariff: t ? `${t.provider} ${t.name}` : null });
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[#060a1c] p-5 ring-1 ring-white/15 sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{t ? "Θέλω αυτό το πρόγραμμα" : "Να με καλέσετε"}</h2>
            <p className="mt-1 text-sm text-slate-400">Ένας σύμβουλος του Billi θα σε καλέσει δωρεάν και θα αναλάβει την αλλαγή.</p>
          </div>
          <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10">✕</button>
        </div>

        {done ? (
          <div className="mt-6 rounded-xl bg-emerald-400/10 p-5 text-center ring-1 ring-emerald-300/30">
            <div className="text-3xl">✅</div>
            <div className="mt-2 font-semibold text-white">Ευχαριστούμε, {form.name.split(" ")[0]}!</div>
            {attachNote && <p className="mt-2 text-xs text-amber-200">{attachNote}</p>}
            <p className="mt-1 text-sm text-slate-300">Θα σε καλέσουμε στο {form.phone} {form.preferred_time !== PREFERRED_TIMES[0] ? `(${form.preferred_time.toLowerCase()})` : "σύντομα"}.</p>
            <button type="button" className={`${btnSecondary} mt-4`} onClick={onClose}>Κλείσιμο</button>
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={submit}>
            {(t || plan || bill || tb) && (
              <div className="rounded-xl bg-white/[0.03] p-3 text-sm ring-1 ring-white/10">
                {t && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{t.provider} · {t.name}</span>
                    <ColorBadge color={t.color} />
                  </div>
                )}
                {plan && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{plan.provider} · {plan.name}</span>
                    <span className="text-xs text-slate-400">{planSpec(plan)}</span>
                  </div>
                )}
                {target.annual != null && (
                  <div className="mt-1 text-xs text-slate-400">
                    {plan ? <>~{eur(target.annual / 12)}/μήνα</> : <>~{eur(target.annual, 0)}/έτος</>}
                    {target.savings != null && target.savings > 0 && <> · κερδίζεις ~{eur(target.savings, 0)}/έτος</>}
                  </div>
                )}
                {currentProvider && <div className="mt-1 text-xs text-slate-500">Σήμερα: {currentProvider} {currentProgram ?? ""}</div>}
              </div>
            )}

            <Field label="Ονοματεπώνυμο *">
              <input required minLength={2} maxLength={100} autoComplete="name" className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="π.χ. Μαρία Παπαδοπούλου" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Τηλέφωνο *">
                <input required type="tel" inputMode="tel" autoComplete="tel" className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="69xxxxxxxx" />
              </Field>
              <Field label="Email">
                <input type="email" autoComplete="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="προαιρετικό" />
              </Field>
            </div>
            <Field label="Τι χρειάζεσαι;">
              <span className="relative block">
                <select className={`${inputCls} appearance-none pr-9`} value={form.requested_service} onChange={(e) => set("requested_service", e.target.value)}>
                  {SERVICES.map((x) => <option key={x}>{x}</option>)}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
              </span>
            </Field>
            <Field label="Πότε να σε καλέσουμε;">
              <span className="relative block">
                <select className={`${inputCls} appearance-none pr-9`} value={form.preferred_time} onChange={(e) => set("preferred_time", e.target.value)}>
                  {PREFERRED_TIMES.map((p) => <option key={p}>{p}</option>)}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
              </span>
            </Field>
            <Field label="Μήνυμα">
              <textarea rows={2} maxLength={1000} className={inputCls} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="προαιρετικό" />
            </Field>

            {/* honeypot for bots: hidden from people */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => set("website", e.target.value)} name="website" />

            <label className="flex items-start gap-2.5 text-sm text-slate-300">
              <input type="checkbox" required checked={form.consent_contact} onChange={(e) => set("consent_contact", e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
              <span>Συμφωνώ να επικοινωνήσει μαζί μου το Billi για την αλλαγή παρόχου, σύμφωνα με την <a href="/privacy" target="_blank" className="underline">Πολιτική Απορρήτου</a>. *</span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-400">
              <input type="checkbox" checked={form.consent_marketing} onChange={(e) => set("consent_marketing", e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
              <span>Θέλω να με ενημερώνετε όταν βγαίνουν φθηνότερα προγράμματα.</span>
            </label>
            {billFile && (
              <label className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] p-3 text-sm text-slate-300 ring-1 ring-white/10">
                <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
                <span>
                  📎 Επισύναψε τον λογαριασμό που ανέβασα, για να γίνει πιο γρήγορα η αλλαγή.
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Τον βλέπει μόνο ο σύμβουλος του Billi και διαγράφεται όταν ολοκληρωθεί ή ακυρωθεί η αλλαγή.
                  </span>
                </span>
              </label>
            )}

            {error && <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-400/30">⚠️ {error}</div>}

            <button type="submit" disabled={sending} className={`${btnPrimary} w-full`}>{sending ? "Αποστολή…" : "Στείλε — θα σε καλέσουμε"}</button>
            <p className="text-center text-[11px] text-slate-500">Δωρεάν, χωρίς δέσμευση. Δεν μοιραζόμαστε τα στοιχεία σου με τρίτους χωρίς τη συγκατάθεσή σου.</p>
          </form>
        )}
      </div>
    </div>
  );
}

/* ───────────── contact + footer ───────────── */

function ContactSection() {
  const want = useContext(LeadCtx);
  const digits = CONTACT_PHONE.replace(/[^\d+]/g, "");
  const intl = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("30") ? digits : `30${digits}`;
  const click = (channel: string) => track("contact_click", { channel });

  return (
    <section id="contact" className="mt-10 scroll-mt-20">
      <div className="gradient-border rounded-2xl">
        <div className="rounded-2xl bg-[#060a1c] p-5 text-center sm:p-6">
          <div className="text-2xl">🤝</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Θες να το αναλάβουμε εμείς;</h2>
          <p className="mt-1 text-sm text-slate-400">Ένας σύμβουλος του Billi σε βοηθά να αλλάξεις πάροχο δωρεάν, χωρίς να ψάχνεις τίποτα.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" className={btnPrimary} onClick={() => want()}>📝 Να με καλέσετε</button>
            {digits && <a href={`tel:${digits}`} className={btnSecondary} onClick={() => click("phone")}>📞 Κάλεσε {CONTACT_PHONE}</a>}
            {digits && <a href={`viber://chat?number=%2B${intl}`} className={btnSecondary} onClick={() => click("viber")}>💜 Viber</a>}
            {digits && <a href={`https://wa.me/${intl}`} target="_blank" rel="noreferrer" className={btnSecondary} onClick={() => click("whatsapp")}>💬 WhatsApp</a>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-8 text-center text-xs text-slate-500">
      <div className="mx-auto max-w-3xl space-y-2">
        <p>
          Το Billi συγκρίνει αμερόληπτα όλα τα προγράμματα που δημοσιεύουν οι πάροχοι. Αν αλλάξεις πάροχο μέσω του Billi,
          μπορεί να λάβουμε προμήθεια από τον πάροχο, χωρίς καμία επιβάρυνση για σένα. Η σειρά της σύγκρισης βγαίνει μόνο από το κόστος.
        </p>
        <p>
          © {new Date().getFullYear()} {COMPANY_NAME} · <a href="/privacy" className="underline">Πολιτική Απορρήτου</a> · <CookieSettingsLink />
        </p>
      </div>
    </footer>
  );
}

/* ───────────── how it works ───────────── */

function HowItWorks() {
  const steps = [
    { icon: "📄", title: "Ανεβάζεις τον λογαριασμό", text: "PDF ή φωτογραφία ρεύματος, αερίου, internet ή κινητής, από οποιονδήποτε πάροχο." },
    { icon: "⚡", title: "Το Billi τον διαβάζει", text: "Βρίσκει κατανάλωση, πάγιο, τιμές, εκπτώσεις, ταχύτητα ή data, ανάλογα με τον λογαριασμό." },
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

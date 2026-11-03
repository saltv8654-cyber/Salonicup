"use client";

import { useState } from "react";
import type { Bill, TariffColor } from "@/lib/types";
import { COLOR_INFO } from "@/lib/types";
import type { Comparison, Offer } from "@/lib/compare";

interface Result {
  bill: Bill;
  warnings: string[];
  comparison: Comparison | null;
  tariffs_updated_at: string | null;
}

const eur = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("el-GR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}\u00a0€`;

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

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative mx-auto max-w-3xl px-4 pb-16 pt-10">
      <header className="flex flex-col items-center text-center">
        <h1><img src="/logo.png" alt="Billi — Know your bills. Save more." className="h-48 w-auto sm:h-56" /></h1>
        <div className="mt-5 flex flex-wrap justify-center gap-2 whitespace-nowrap text-xs">
          <span className="rounded-full bg-blue-500/15 px-3 py-1 text-blue-300 ring-1 ring-blue-400/30">⚡ Ρεύμα</span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-slate-500 ring-1 ring-white/10">🔥 Αέριο · σύντομα</span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-slate-500 ring-1 ring-white/10">📶 Internet · σύντομα</span>
        </div>
      </header>

      <label className="gradient-border group mt-10 block cursor-pointer rounded-2xl">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#060a1c] px-6 py-10 text-center transition group-hover:bg-[#0a1028]">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={loading}
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {loading ? (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-cyan-300" />
              <span className="mt-4 font-medium text-white">Το AI διαβάζει τον λογαριασμό…</span>
            </>
          ) : (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-blue-500 via-cyan-400 to-violet-500 text-2xl">⚡</span>
              <span className="mt-4 text-lg font-semibold text-white">Ανέβασε τον λογαριασμό ρεύματος</span>
              <span className="mt-1 text-sm text-slate-400">PDF ή φωτογραφία · έως 10 MB</span>
            </>
          )}
        </div>
      </label>

      {error && <div className="mt-6 rounded-xl bg-red-500/10 p-4 text-red-300 ring-1 ring-red-400/30">{error}</div>}

      {result && (
        <>
          <BillSummary bill={result.bill} warnings={result.warnings} />
          {result.comparison && (
            <ComparisonView c={result.comparison} current={result.bill} updatedAt={result.tariffs_updated_at} />
          )}
        </>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-2xl bg-white/[0.03] p-6 ring-1 ring-white/10 backdrop-blur">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function BillSummary({ bill, warnings }: { bill: Bill; warnings: string[] }) {
  const rows: [string, React.ReactNode][] = [
    ["Πάροχος", bill.provider ?? "—"],
    ["Πρόγραμμα", bill.program_name ?? "—"],
    ["Χρώμα", <ColorBadge key="c" color={bill.tariff_color} />],
    ["Περίοδος", bill.period_start && bill.period_end ? `${bill.period_start} – ${bill.period_end}` : "—"],
    ["Ημέρες", bill.billing_days ?? "—"],
    ["Κατανάλωση", bill.kwh_total !== null ? `${bill.kwh_total} kWh` : "—"],
    ["Τιμή ενέργειας", bill.kwh_rate !== null ? `${bill.kwh_rate} €/kWh` : "—"],
    ["Πάγιο", eur(bill.fixed_monthly_fee)],
  ];
  return (
    <Card title="Ο λογαριασμός σου">
      <div className="mt-4 flex items-baseline justify-between rounded-xl bg-gradient-to-r from-blue-500/15 via-cyan-400/10 to-violet-500/15 px-4 py-3 ring-1 ring-white/10">
        <span className="text-sm text-slate-300">Σύνολο πληρωμής</span>
        <span className="text-2xl font-bold text-white">{eur(bill.total_due)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd className="text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
      {warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200 ring-1 ring-amber-300/20">
          {warnings.map((w) => <li key={w}>⚠️ {w}</li>)}
        </ul>
      )}
    </Card>
  );
}

function ComparisonView({ c, current, updatedAt }: { c: Comparison; current: Bill; updatedAt: string | null }) {
  const isCurrent = (o: Offer) =>
    !!current.provider && o.tariff.provider.toLowerCase() === current.provider.toLowerCase() &&
    !!current.program_name && o.tariff.name.toLowerCase() === current.program_name.toLowerCase();

  return (
    <Card title="Σύγκριση παρόχων">
      <p className="mt-1 text-sm text-slate-400">
        Εκτιμώμενη ετήσια κατανάλωση: <strong className="text-slate-200">{c.annualKwh.toLocaleString("el-GR")} kWh</strong>
        {c.currentAnnual !== null && <> · Σήμερα πληρώνεις ~<strong className="text-slate-200">{eur(c.currentAnnual, 0)}</strong>/έτος για προμήθεια</>}
      </p>

      {c.recommendation && (
        <div className="gradient-border mt-5 rounded-xl">
          <div className="rounded-xl bg-[#081028] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gradient">✦ Πρόταση Billi AI</div>
            <div className="mt-1.5 text-slate-100">{COLOR_INFO[c.recommendation.color].emoji} {c.recommendation.text}</div>
          </div>
        </div>
      )}

      {c.offers.length === 0 ? (
        <p className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-400">
          Δεν έχουν καταχωριστεί ακόμα τιμές παρόχων. Συμπλήρωσε το <code>data/tariffs.json</code>.
        </p>
      ) : (
        <>
          <ul className="mt-5 space-y-3 sm:hidden">
            {c.offers.map((o, i) => (
              <li
                key={o.tariff.id}
                className={`rounded-xl p-4 ring-1 ${i === 0 ? "bg-cyan-400/[0.07] ring-cyan-300/40" : "bg-white/[0.02] ring-white/10"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">
                      {o.tariff.url ? <a href={o.tariff.url} target="_blank" rel="noreferrer" className="underline decoration-white/30">{o.tariff.provider}</a> : o.tariff.provider}
                    </div>
                    <div className="text-xs text-slate-400">{o.tariff.name}{isCurrent(o) && " (τρέχον)"}</div>
                  </div>
                  <ColorBadge color={o.tariff.color} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    {offerPrice(o).toFixed(4)} €/kWh · πάγιο {eur(o.tariff.fixed_monthly_eur)}
                    {o.tariff.discount_condition && <div>{o.tariff.discount_condition}</div>}
                  </div>
                  <div className="text-right">
                    <div className="whitespace-nowrap text-lg font-semibold text-white">{eur(offerAnnual(o), 0)}<span className="text-xs font-normal text-slate-400">/έτος</span></div>
                    {o.savings !== null && (
                      <div className={`whitespace-nowrap text-sm ${o.savings > 0 ? "text-emerald-300" : "text-slate-500"}`}>
                        {o.savings > 0 ? `κερδίζεις ${eur(o.savings, 0)}` : `${eur(-o.savings, 0)} ακριβότερο`}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Πάροχος / Πρόγραμμα</th>
                  <th className="py-2 pr-3 font-medium">Χρώμα</th>
                  <th className="py-2 pr-3 text-right font-medium">€/kWh</th>
                  <th className="py-2 pr-3 text-right font-medium">Πάγιο</th>
                  <th className="py-2 pr-3 text-right font-medium">€/έτος</th>
                  <th className="py-2 text-right font-medium">Εξοικονόμηση</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {c.offers.map((o, i) => (
                  <tr key={o.tariff.id} className={`border-t border-white/10 ${i === 0 ? "bg-cyan-400/[0.06]" : ""} ${isCurrent(o) ? "font-medium" : ""}`}>
                    <td className="py-3 pr-3">
                      {o.tariff.url ? <a href={o.tariff.url} target="_blank" rel="noreferrer" className="underline decoration-white/30">{o.tariff.provider}</a> : o.tariff.provider}
                      <div className="text-xs text-slate-400">{o.tariff.name}{isCurrent(o) && " (τρέχον)"}</div>
                    </td>
                    <td className="py-3 pr-3"><ColorBadge color={o.tariff.color} /></td>
                    <td className="py-3 pr-3 text-right">
                      {offerPrice(o).toFixed(4)}
                      {o.tariff.discount_condition && <div className="text-xs text-slate-400">{o.tariff.discount_condition}</div>}
                    </td>
                    <td className="py-3 pr-3 text-right">{eur(o.tariff.fixed_monthly_eur)}</td>
                    <td className="py-3 pr-3 text-right font-semibold text-white">{eur(offerAnnual(o), 0)}</td>
                    <td className={`py-3 text-right ${o.savings !== null && o.savings > 0 ? "text-emerald-300" : "text-slate-500"}`}>
                      {o.savings === null ? "—" : `${o.savings > 0 ? "+" : ""}${eur(o.savings, 0)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-5 text-xs text-slate-500">
        Ποσά με ΦΠΑ 6%, μόνο χρεώσεις προμήθειας. Οι ρυθμιζόμενες χρεώσεις, οι δημοτικοί φόροι και η ΕΡΤ είναι ίδια σε
        όλους τους παρόχους. Η ετήσια κατανάλωση είναι γραμμική προέκταση της περιόδου του λογαριασμού.
        {updatedAt && <> Τιμές: {updatedAt}.</>}
      </p>
    </Card>
  );
}

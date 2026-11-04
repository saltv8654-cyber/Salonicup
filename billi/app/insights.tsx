"use client";

import { useState } from "react";
import type { Bill, Tariff } from "@/lib/types";
import { COLOR_INFO } from "@/lib/types";
import { breakdown } from "@/lib/breakdown";
import type { Comparison, Pick } from "@/lib/compare";
import type { BilliScore } from "@/lib/score";

const eur = (n: number, d = 2) => `${n.toLocaleString("el-GR", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const card = "mt-6 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-6";

/* Validated categorical palette for the dark surface (dataviz validator: lightness, chroma, CVD, contrast all pass). */
const GROUP_COLOR: Record<string, string> = { supply: "#0891b2", regulated: "#8b5cf6", taxes: "#d97706", other: "#db2777" };

/* ───────────── where the money goes ───────────── */

export function BillBreakdown({ bill }: { bill: Bill }) {
  const b = breakdown(bill);
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  if (!b) return null;
  const positive = b.groups.filter((g) => g.amount > 0 && g.key !== "other");
  const total = positive.reduce((n, g) => n + g.amount, 0);

  return (
    <section className={card} aria-labelledby="where-title">
      <h2 id="where-title" className="text-lg font-semibold text-white">Πού πάνε τα χρήματά σου</h2>
      <p className="mt-1 text-sm text-slate-400">
        Οι χρεώσεις της περιόδου{b.avgDailyKwh !== null ? ` · μέση κατανάλωση ${b.avgDailyKwh.toLocaleString("el-GR", { maximumFractionDigits: 1 })} kWh/ημέρα` : ""}
      </p>

      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Κατανομή χρεώσεων">
            {positive.map((g) => (
              <div
                key={g.key}
                title={`${g.label}: ${eur(g.amount)} (${Math.round((g.amount / total) * 100)}%)`}
                onMouseEnter={() => setHover(g.key)}
                onMouseLeave={() => setHover(null)}
                className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(g.amount / total) * 100}%`, background: GROUP_COLOR[g.key], opacity: hover && hover !== g.key ? 0.45 : 1 }}
              />
            ))}
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {b.groups.map((g) => (
          <li key={g.key} className="rounded-xl bg-white/[0.02] ring-1 ring-white/10" onMouseEnter={() => setHover(g.key)} onMouseLeave={() => setHover(null)}>
            <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key}>
              <span className="flex min-w-0 items-center gap-2.5">
                <i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: GROUP_COLOR[g.key] }} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-100">{g.label}</span>
                  <span className={`block text-[11px] ${g.switchable ? "text-cyan-300" : "text-slate-500"}`}>
                    {g.switchable ? "Αλλάζει αν αλλάξεις πάροχο" : g.key === "other" ? "Δεν αφορά την κατανάλωση της περιόδου" : "Ίδιες σε όλους τους παρόχους"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-bold tabular-nums text-white">{eur(g.amount)}</span>
                {total > 0 && g.key !== "other" && <span className="w-10 text-right text-xs tabular-nums text-slate-400">{Math.round((Math.max(g.amount, 0) / total) * 100)}%</span>}
                {g.items.length > 0 && <span className="text-slate-500">{open === g.key ? "▴" : "▾"}</span>}
              </span>
            </button>
            {open === g.key && g.items.length > 0 && (
              <ul className="space-y-1 border-t border-white/5 px-3 py-2 pl-9 text-xs">
                {g.items.map((i) => (
                  <li key={i.label} className="flex justify-between gap-3 text-slate-400">
                    <span>{i.label}</span><span className="tabular-nums text-slate-200">{eur(i.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-1 text-xs text-slate-400">
        {b.supplyShare !== null && (
          <p>
            💡 Αλλάζοντας πάροχο αλλάζει μόνο η <b className="text-slate-200">προμήθεια</b> (~{Math.round(b.supplyShare * 100)}% των χρεώσεων της περιόδου) και ο ΦΠΑ που της αναλογεί.
            Οι ρυθμιζόμενες χρεώσεις, οι φόροι και τα δημοτικά τέλη μένουν ίδια.
          </p>
        )}
        {b.totalDue !== null && <p>Σύνολο πληρωμής στον λογαριασμό: <b className="text-slate-200">{eur(b.totalDue)}</b></p>}
        {b.mismatch && <p className="text-amber-200">⚠️ Τα ποσά που διαβάστηκαν δεν αθροίζουν ακριβώς στο σύνολο πληρωμής. Μπορεί να υπάρχουν χρεώσεις που δεν αναγνωρίστηκαν.</p>}
      </div>
    </section>
  );
}

/* ───────────── BILLI SCORE ───────────── */

export function ScoreCard({ s }: { s: BilliScore }) {
  const tone = s.score >= 85 ? { c: "#34d399", l: "Πολύ καλό" } : s.score >= 65 ? { c: "#fbbf24", l: "Μέτριο" } : { c: "#fb7185", l: "Χρειάζεται βελτίωση" };
  // Semicircle gauge: 180° arc, filled in proportion to the score.
  const r = 52, cx = 64, cy = 64, len = Math.PI * r;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <section className={card} aria-labelledby="score-title">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 text-center">
          <svg viewBox="0 0 128 76" className="w-44" role="img" aria-label={`Billi Score ${s.score} στα 100`}>
            <path d={arc} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round" />
            <path d={arc} fill="none" stroke={tone.c} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(s.score / 100) * len} ${len}`} />
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">{s.score}</text>
            <text x={cx} y={cy + 9} textAnchor="middle" fontSize="9" fill="#94a3b8">/100</text>
          </svg>
          <div className="text-xs font-semibold" style={{ color: tone.c }}>● {tone.l}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div id="score-title" className="text-xs font-semibold uppercase tracking-wider text-gradient">Το Billi Score σου</div>
          <p className="mt-1 text-lg font-semibold text-white">{s.headline}</p>
          {s.potentialSavings >= 1 && (
            <p className="mt-1 text-sm text-slate-300">Πιθανή εξοικονόμηση: <b className="text-emerald-300">~{eur(s.potentialSavings, 0)}/έτος</b> <span className="text-xs text-slate-500">(εκτίμηση, όχι εγγύηση)</span></p>
          )}
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {s.parts.map((p) => (
          <li key={p.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-200">{p.label}</span>
              <span className="tabular-nums text-slate-400"><b className="text-white">{p.points}</b>/{p.max}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${(p.points / p.max) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{p.detail}</p>
          </li>
        ))}
      </ul>

      {s.actions.length > 0 && (
        <div className="mt-5 rounded-xl bg-cyan-400/[0.06] p-3 ring-1 ring-cyan-300/20">
          <div className="text-sm font-semibold text-white">Πώς ανεβαίνει το σκορ σου</div>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-300">
            {s.actions.map((a) => <li key={a} className="flex gap-2"><span className="text-cyan-300">→</span><span>{a}</span></li>)}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-500">
        Το σκορ υπολογίζεται μόνο από μετρήσιμα στοιχεία: το κόστος σου, τις επιβεβαιωμένες τιμές της αγοράς, το πάγιο, τον τύπο τιμολογίου και τη σύμβαση.
      </p>
    </section>
  );
}

/* ───────────── three recommendations ───────────── */

const PICK: Record<Pick["kind"], { title: string; icon: string; sub: string }> = {
  cheapest: { title: "Φθηνότερη επιλογή", icon: "💶", sub: "Το χαμηλότερο εκτιμώμενο ετήσιο κόστος" },
  value: { title: "Καλύτερη αξία", icon: "⚖️", sub: "Ισορροπία κόστους, όρων και σταθερότητας" },
  stable: { title: "Πιο σταθερή", icon: "🛡️", sub: "Προβλέψιμος λογαριασμός, σταθερή τιμή" },
};

export function PicksView({ c, onWant }: { c: Comparison; onWant: (t: { tariff: Tariff; annual: number; savings: number | null }) => void }) {
  if (c.picks.length === 0) {
    return (
      <section className={card}>
        <h2 className="text-lg font-semibold text-white">Οι προτάσεις του Billi</h2>
        <p className="mt-2 text-sm text-slate-300">
          Αυτή τη στιγμή δεν υπάρχουν προγράμματα με τιμή επιβεβαιωμένη από την επίσημη πηγή, οπότε δεν κάνουμε σύγκριση: δεν θέλουμε να σου δείξουμε εξοικονόμηση με τιμές που ίσως δεν ισχύουν.
        </p>
        <p className="mt-2 text-sm text-slate-400">Πάτα «Να με καλέσετε» και ένας σύμβουλος θα σου πει τις τρέχουσες τιμές.</p>
      </section>
    );
  }
  // The same programme can win more than one category: show it once with every badge.
  const groups: { p: Pick; kinds: Pick["kind"][]; why: string[] }[] = [];
  for (const p of c.picks) {
    const g = groups.find((x) => x.p.offer.tariff.id === p.offer.tariff.id);
    if (g) {
      g.kinds.push(p.kind);
      g.why.push(...p.why.filter((w) => !g.why.includes(w)));
    } else groups.push({ p, kinds: [p.kind], why: [...p.why] });
  }
  return (
    <section className={card} aria-labelledby="picks-title">
      <h2 id="picks-title" className="text-lg font-semibold text-white">Οι 3 προτάσεις του Billi</h2>
      <p className="mt-1 text-sm text-slate-400">Με τη δική σου κατανάλωση ({c.annualKwh.toLocaleString("el-GR")} kWh/έτος) και μόνο επιβεβαιωμένες τιμές.</p>
      <div className={`mt-4 grid gap-3 ${groups.length === 3 ? "lg:grid-cols-3" : groups.length === 2 ? "md:grid-cols-2" : ""}`}>
        {groups.map(({ p, kinds, why }) => {
          const t = p.offer.tariff;
          const annual = p.offer.annualWithDiscount ?? p.offer.annual;
          return (
            <article key={p.kind} className={`flex flex-col rounded-2xl p-4 ring-1 ${kinds.includes("value") ? "bg-cyan-400/[0.06] ring-cyan-300/40" : "bg-white/[0.02] ring-white/10"}`}>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wider text-gradient">{kinds.map((k) => <span key={k}>{PICK[k].icon} {PICK[k].title}</span>)}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{kinds.map((k) => PICK[k].sub).join(" · ")}</div>
              <div className="mt-2 font-semibold text-white">{t.provider} · {t.name}</div>
              <div className="text-xs text-slate-400">{COLOR_INFO[t.color].emoji} {COLOR_INFO[t.color].label} · {(t.price_per_kwh_with_discount_eur ?? t.price_per_kwh_eur).toFixed(3)} €/kWh · πάγιο {eur(t.fixed_monthly_eur)}</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{eur(annual, 0)}</span><span className="text-xs text-slate-400">/έτος · ~{eur(annual / 12, 0)}/μήνα</span>
              </div>
              {p.savings !== null && (
                <div className={`text-sm font-semibold ${p.savings > 0 ? "text-emerald-300" : "text-slate-400"}`}>
                  {p.savings > 0 ? `▼ εκτιμώμενη εξοικονόμηση ~${eur(p.savings, 0)}/έτος` : `▲ ~${eur(-p.savings, 0)}/έτος ακριβότερο από σήμερα`}
                </div>
              )}
              <Detail title="Γιατί" items={why} />
              {p.conditions.length > 0 && <Detail title="Όροι" items={p.conditions} />}
              {p.risks.length > 0 && <Detail title="Κίνδυνοι" items={p.risks} warn />}
              <button type="button" onClick={() => onWant({ tariff: t, annual, savings: p.savings })}
                className="mt-4 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110">
                ✋ Θέλω αυτό
              </button>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Τα ποσά είναι εκτιμήσεις με ΦΠΑ, μόνο για τις χρεώσεις προμήθειας. Για κυμαινόμενα τιμολόγια το μελλοντικό κόστος δεν μπορεί να εγγυηθεί.</p>
    </section>
  );
}

function Detail({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  return (
    <div className="mt-3">
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${warn ? "text-amber-200/80" : "text-slate-500"}`}>{title}</div>
      <ul className="mt-1 space-y-1 text-xs text-slate-300">{items.map((i) => <li key={i} className="flex gap-1.5"><span className={warn ? "text-amber-300" : "text-cyan-300"}>•</span><span>{i}</span></li>)}</ul>
    </div>
  );
}

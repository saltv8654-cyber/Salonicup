"use client";

import { useEffect, useState } from "react";
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

/* ───────────── save to the personal profile ───────────── */

export function SaveToProfile({ bill }: { bill: Bill }) {
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setState("busy");
    const body = JSON.stringify({ bill });
    try {
      const res = await fetch("/api/account/bills", { method: "POST", headers: { "content-type": "application/json" }, body });
      if (res.status === 401) {
        // Not signed in: keep the figures for this tab only and finish after sign-in.
        try { sessionStorage.setItem("billi_pending_bill", body); } catch { /* storage blocked */ }
        location.href = "/account";
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error === "missing_migration" ? "Οι λογαριασμοί ενεργοποιούνται σύντομα." : j.error ?? "Η αποθήκευση απέτυχε");
      setState("saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Η αποθήκευση απέτυχε");
      setState("error");
    }
  };
  return (
    <section className={`${card} flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between`}>
      <div>
        <div className="font-semibold text-white">📊 Παρακολούθησε τον λογαριασμό σου</div>
        <p className="text-sm text-slate-400">Αποθήκευσε τα στοιχεία (όχι το αρχείο) στο προφίλ σου: ιστορικό, Billi Score και ειδοποίηση όταν βγει φθηνότερο πρόγραμμα.</p>
        {state === "error" && msg && <p className="mt-1 text-sm text-red-300">⚠️ {msg}</p>}
      </div>
      {state === "saved" ? (
        <a href="/account" className="shrink-0 rounded-xl bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-300/40">✓ Αποθηκεύτηκε · Άνοιγμα προφίλ</a>
      ) : (
        <button type="button" disabled={state === "busy"} onClick={save} className="shrink-0 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">
          {state === "busy" ? "…" : "💾 Αποθήκευση στο προφίλ μου"}
        </button>
      )}
    </section>
  );
}

/* ───────────── result first + what to do next ───────────── */

/** The answer at the top: how much you could save, with what, and the next step. Details follow below. */
export function ResultHero({ c, onWant, phone, kind }: { c: Comparison; onWant: (t: { tariff: Tariff; annual: number; savings: number | null }) => void; phone: string; kind: "ρεύμα" | "αέριο" }) {
  const best = c.picks.find((p) => p.kind === "value") ?? c.picks[0];
  if (!best) return null;
  const t = best.offer.tariff;
  const annual = best.offer.annualWithDiscount ?? best.offer.annual;
  const saves = best.savings !== null && best.savings >= 10;
  const already = best.savings !== null && best.savings < 10;
  const digits = phone.replace(/[^\d+]/g, "");
  const intl = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("30") ? digits : `30${digits}`;
  const msg = `Γεια σας! Έκανα ανάλυση στο Billi για ${kind}: ${t.provider} ${t.name}, ~${eur(annual / 12, 0)}/μήνα${saves ? `, εξοικονόμηση ~${eur(best.savings!, 0)}/έτος` : ""}. Θα ήθελα να μάθω περισσότερα.`;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="gradient-border mt-6 rounded-2xl" aria-labelledby="hero-title">
      <div className="rounded-2xl bg-[#081028] p-5 sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-gradient">✦ Το αποτέλεσμά σου</div>
        <h2 id="hero-title" className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">
          {saves ? <>Γλιτώνεις ~{eur(best.savings!, 0)} τον χρόνο</> : already ? <>Είσαι ήδη σε καλό πρόγραμμα 👍</> : <>Το καλύτερο για σένα: ~{eur(annual / 12, 0)}/μήνα</>}
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          {saves || !already ? <>με το <b className="text-white">{t.provider} · {t.name}</b> ({COLOR_INFO[t.color].emoji} {COLOR_INFO[t.color].label.toLowerCase()}){saves ? <>, ~{eur(annual / 12, 0)}/μήνα</> : null}.</> : <>Η διαφορά από την καλύτερη επιλογή είναι μικρή: δεν αξίζει να αλλάξεις τώρα. Θα σε ειδοποιήσουμε αν βγει κάτι καλύτερο.</>}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">Εκτίμηση με επιβεβαιωμένες τιμές, όχι εγγύηση.</p>

        {!already && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => onWant({ tariff: t, annual, savings: best.savings })} className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white hover:brightness-110">
              ✋ Θέλω αυτό, καλέστε με
            </button>
            {digits && <a href={`viber://chat?number=%2B${intl}&draft=${encodeURIComponent(msg)}`} className="rounded-xl bg-[#7360f2]/20 px-4 py-3 text-center text-sm font-semibold text-violet-100 ring-1 ring-violet-300/30">💜 Στείλε στο Viber</a>}
            {digits && <a href={`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold text-emerald-100 ring-1 ring-emerald-300/30">💬 Στείλε στο WhatsApp</a>}
          </div>
        )}

        <ol className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
          {[
            ["1", "Διάλεξε πρόγραμμα", "Δες τις 3 προτάσεις ή όλη τη σύγκριση."],
            ["2", "Σε καλούμε", "Την ώρα που σε βολεύει, δωρεάν και χωρίς δέσμευση."],
            ["3", "Αλλάζεις", "Χωρίς διακοπή ρεύματος, χωρίς χαρτιά από εσένα."],
          ].map(([n, title, text]) => (
            <li key={n} className="flex gap-2.5 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-400/15 text-xs font-bold text-cyan-200">{n}</span>
              <span><b className="text-slate-100">{title}</b><span className="block text-xs text-slate-400">{text}</span></span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => scrollTo("picks-title")} className="mt-3 text-xs font-semibold text-cyan-300 underline">Δες τις λεπτομέρειες ↓</button>
      </div>
    </section>
  );
}

/** What happens while the bill is read: visible steps instead of a bare spinner. */
export function AnalysisProgress() {
  const steps = ["Διαβάζω τον λογαριασμό", "Βρίσκω την κατανάλωση και τις χρεώσεις", "Συγκρίνω όλα τα επιβεβαιωμένα προγράμματα", "Ετοιμάζω τις προτάσεις"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 3500);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="w-full max-w-xs text-left" role="status" aria-live="polite">
      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-cyan-300" />
      <ul className="mt-5 space-y-2">
        {steps.map((s, k) => (
          <li key={s} className={`flex items-center gap-2 text-sm transition ${k < i ? "text-emerald-300" : k === i ? "font-semibold text-white" : "text-slate-500"}`}>
            <span className="w-4 text-center">{k < i ? "✓" : k === i ? "…" : "·"}</span>{s}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs text-slate-500">Συνήθως 5–15 δευτερόλεπτα</p>
    </div>
  );
}

/** Why trust the numbers: official prices, nothing kept, free. */
export function TrustBar({ updatedAt }: { updatedAt: string | null }) {
  const date = updatedAt ? new Date(updatedAt).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" }) : null;
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
      <li>🏛 Τιμές από το εργαλείο της ΡΑΑΕΥ{date ? ` · ενημέρωση ${date}` : ""}</li>
      <li>🔒 Δεν κρατάμε το αρχείο σου</li>
      <li>✓ Δωρεάν, χωρίς δέσμευση</li>
    </ul>
  );
}

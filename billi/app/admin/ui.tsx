"use client";

import { useState } from "react";

/* Shared building blocks of the CRM pages. */

export const eur = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Number(n).toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
export const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" });

export const card = "rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10";
export const input =
  "w-full rounded-xl bg-[#0a1028] px-3 py-2 text-sm text-slate-100 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/60";
export const btn = "rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50";
export const btnGhost = "rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-white/10";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (!res.ok) throw new Error(json.error ?? `Σφάλμα ${res.status}`);
  return json as T;
}

export function SqlStep({ title, text, sql, onRetry }: { title: string; text: React.ReactNode; sql: string; onRetry: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={`${card} space-y-3`}>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-sm text-slate-300">{text} Στο Supabase: <b>SQL Editor → New query</b>, επικόλλησε το παρακάτω και πάτα <b>Run</b>. Μετά πάτα «Έλεγχος ξανά».</p>
      <pre className="max-h-64 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-slate-300 ring-1 ring-white/10">{sql}</pre>
      <div className="flex gap-2">
        <button className={btn} onClick={() => navigator.clipboard?.writeText(sql).then(() => setMsg("Αντιγράφηκε"))}>📋 Αντιγραφή</button>
        <button className={btnGhost} onClick={onRetry}>↻ Έλεγχος ξανά</button>
      </div>
      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
    </div>
  );
}

export function L({ t, children, hint }: { t: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-xs text-slate-400">{t}<div className="mt-1">{children}</div>{hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}</label>
  );
}

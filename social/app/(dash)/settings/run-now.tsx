"use client";
import Link from "next/link";
import { useState } from "react";
import { runRecurringNow } from "./actions";

type Result = Awaited<ReturnType<typeof runRecurringNow>>;
const STATUS: Record<string, string> = { scheduled: "προγραμματίστηκε", pending_approval: "περιμένει έγκριση", draft: "draft" };

export function RunNow({ kind }: { kind: "weekly_program" | "weekly_standings" }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
      <button className="btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { setRes(await runRecurringNow(kind)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Δημιουργία…" : "Δημιουργία τώρα"}</button>
      <span className="muted ml-3">Φτιάχνει τώρα ό,τι θα έφτιαχνε {kind === "weekly_program" ? "την Πέμπτη" : "τη Δευτέρα"}. Δεν δημιουργεί διπλά.</span>
      {err && <p className="mt-2 text-rose-600">{err}</p>}
      {res && (
        <div className="mt-3 space-y-1">
          <p className="font-medium">{kind === "weekly_program" ? "Πρόγραμμα εβδομάδας από" : "Βαθμολογίες εβδομάδας"} {res.week_start}</p>
          {res.created.map((c) => <p key={c.content_id}>✓ {c.league}: {STATUS[c.status] ?? c.status}</p>)}
          {res.skipped.map((s) => <p key={s.league} className="muted">– {s.league}: {s.reason}</p>)}
          {res.created.length > 0 && <p><Link className="underline" href="/calendar">Δες τα στο Calendar</Link> · <Link className="underline" href="/approvals">Εγκρίσεις</Link></p>}
        </div>
      )}
    </div>
  );
}

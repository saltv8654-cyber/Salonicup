import Link from "next/link";
import { userClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { INTEGRATIONS, integrationState } from "@/lib/integrations";
import { upcomingMatches, recentResults } from "@/lib/salonicup";
import { PageHeader, Stat, StatusBadge, fmtDate } from "@/app/ui";

export default async function Overview() {
  const settings = (await getSettings())!;
  const tz = settings.timezone;
  const db = userClient();
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [drafts, upcoming, pending, accounts, runs, memories, cost, matches, results] = await Promise.all([
    db.from("social_content").select("id", { count: "exact", head: true }).in("status", ["idea", "draft"]),
    db.from("social_content").select("id,title,kind,status,planned_for,platforms")
      .gte("planned_for", new Date().toISOString()).lte("planned_for", weekAhead).order("planned_for").limit(8),
    db.from("social_approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("social_accounts").select("id", { count: "exact", head: true }).eq("status", "connected"),
    db.from("social_runs").select("id,trigger,workflow,status,summary,started_at,cost_usd").order("started_at", { ascending: false }).limit(5),
    db.from("social_memories").select("id", { count: "exact", head: true }).eq("archived", false),
    db.rpc("social_month_cost"),
    upcomingMatches(db, 7).catch(() => []),
    recentResults(db, 7).catch(() => []),
  ]);
  const coreDown = INTEGRATIONS.filter((i) => i.phase === 1 && integrationState(i) !== "active");

  return (
    <>
      <PageHeader title="Overview" subtitle="Πραγματικά δεδομένα: η βάση του Salonicup και ό,τι έχει κάνει ο agent. Analytics από τις πλατφόρμες έρχονται με τη σύνδεση λογαριασμών (Phase 3–4)."
        actions={<Link href="/chat" className="btn-primary">✦ Δώσε εντολή στον agent</Link>} />

      {coreDown.length > 0 && (
        <div className="card mb-6 border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-medium">Ο πυρήνας δεν είναι πλήρως ρυθμισμένος</p>
          <p className="muted mt-1">{coreDown.map((i) => i.name).join(", ")} — δες <Link className="underline" href="/status">Κατάσταση APIs</Link>.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Drafts" value={drafts.count ?? 0} />
        <Stat label="Εκκρεμείς εγκρίσεις" value={pending.count ?? 0} />
        <Stat label="Συνδεδεμένοι λογαριασμοί" value={accounts.count ?? 0} hint={accounts.count ? undefined : "Phase 3"} />
        <Stat label="Κόστος AI μήνα" value={`$${Number(cost.data ?? 0).toFixed(2)}`} hint={`όριο $${settings.monthly_ai_budget_usd} · μνήμη: ${memories.count ?? 0}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Αγώνες επόμενων 7 ημερών <span className="muted font-normal">({matches.length})</span></h2>
          {matches.length ? (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {matches.slice(0, 8).map((m) => (
                <li key={m.match_id} className="py-2"><p className="font-medium">{m.home} – {m.away}</p>
                  <p className="muted text-xs">{fmtDate(m.date, tz)} · {m.league}{m.venue ? ` · ${m.venue}` : ""}</p></li>
              ))}
            </ul>
          ) : <p className="muted">Κανένας αγώνας στο πρόγραμμα.</p>}
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Αποτελέσματα τελευταίων 7 ημερών <span className="muted font-normal">({results.length})</span></h2>
          {results.length ? (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {results.slice(0, 8).map((r) => (
                <li key={r.match_id} className="py-2"><p className="font-medium">{r.home} <span className="tabular-nums">{r.score}</span> {r.away}</p>
                  <p className="muted text-xs">{r.league}{r.mvp ? ` · MVP: ${r.mvp}` : ""}</p></li>
              ))}
            </ul>
          ) : <p className="muted">Κανένα αποτέλεσμα αυτή την εβδομάδα.</p>}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Περιεχόμενο επόμενων 7 ημερών</h2>
          {upcoming.data?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{c.title}</p>
                    <p className="muted text-xs">{fmtDate(c.planned_for, tz)} · {c.kind} · {c.platforms.join(", ")}</p></div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          ) : <p className="muted">Τίποτα στο calendar. Ζήτα από τον agent: «Φτιάξε τα posts της αγωνιστικής».</p>}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Τελευταίες εκτελέσεις του agent</h2>
          {runs.data?.length ? (
            <ul className="space-y-3">
              {runs.data.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center gap-2"><StatusBadge status={r.status} />
                    <span className="muted text-xs">{fmtDate(r.started_at, tz)} · {r.workflow ?? r.trigger} · ${Number(r.cost_usd).toFixed(3)}</span></div>
                  {r.summary && <p className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-300">{r.summary}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="muted">Ο agent δεν έχει τρέξει ακόμα.</p>}
        </section>
      </div>
    </>
  );
}

import Link from "next/link";
import { requireBusinessAccess } from "@/lib/access";
import { userClient } from "@/lib/supabase/server";
import { INTEGRATIONS, integrationState } from "@/lib/integrations";
import { PageHeader, Stat, StatusBadge, Empty, fmtDate } from "@/app/ui";

export default async function Overview({ params }: { params: { businessId: string } }) {
  const { business, org } = await requireBusinessAccess(params.businessId);
  const db = userClient();
  const id = business.id;
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [drafts, upcoming, pending, accounts, runs, memories, usage] = await Promise.all([
    db.from("content_items").select("id", { count: "exact", head: true }).eq("business_id", id).in("status", ["idea", "draft"]),
    db.from("content_items").select("id,title,kind,status,planned_for,platforms").eq("business_id", id)
      .gte("planned_for", new Date().toISOString()).lte("planned_for", weekAhead).order("planned_for").limit(8),
    db.from("approvals").select("id", { count: "exact", head: true }).eq("business_id", id).eq("status", "pending"),
    db.from("social_accounts").select("id", { count: "exact", head: true }).eq("business_id", id).eq("status", "connected"),
    db.from("agent_runs").select("id,trigger,workflow,status,summary,started_at,cost_usd").eq("business_id", id).order("started_at", { ascending: false }).limit(5),
    db.from("memories").select("id", { count: "exact", head: true }).eq("business_id", id).eq("archived", false),
    db.rpc("org_month_usage", { p_org: org.id }).single<{ cost_usd: number; runs: number }>(),
  ]);
  const base = `/b/${id}`;
  const core = INTEGRATIONS.filter((i) => i.phase === 1);
  const coreDown = core.filter((i) => integrationState(i) !== "active");

  return (
    <>
      <PageHeader title="Overview" subtitle="Πραγματικά δεδομένα από τη βάση. Analytics από πλατφόρμες εμφανίζονται μόλις συνδεθούν λογαριασμοί (Phase 3–4)."
        actions={<Link href={`${base}/chat`} className="btn-primary">✦ Δώσε εντολή στον agent</Link>} />

      {coreDown.length > 0 && (
        <div className="card mb-6 border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-medium">Ο πυρήνας δεν είναι πλήρως ρυθμισμένος</p>
          <p className="muted mt-1">{coreDown.map((i) => i.name).join(", ")} — δες <Link className="underline" href={`${base}/status`}>Κατάσταση APIs</Link>.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Drafts" value={drafts.count ?? 0} />
        <Stat label="Εκκρεμείς εγκρίσεις" value={pending.count ?? 0} />
        <Stat label="Συνδεδεμένοι λογαριασμοί" value={accounts.count ?? 0} hint={accounts.count ? undefined : "Phase 3"} />
        <Stat label="Μνήμη agent" value={memories.count ?? 0} hint="καταχωρήσεις" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Επόμενες 7 ημέρες</h2>
          {upcoming.data?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{c.title}</p>
                    <p className="muted text-xs">{fmtDate(c.planned_for, business.timezone)} · {c.kind} · {c.platforms.join(", ")}</p></div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          ) : <p className="muted">Τίποτα προγραμματισμένο. Ζήτα από τον agent ένα πλάνο εβδομάδας.</p>}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Τελευταίες εκτελέσεις του agent</h2>
          {runs.data?.length ? (
            <ul className="space-y-3">
              {runs.data.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center gap-2"><StatusBadge status={r.status} />
                    <span className="muted text-xs">{fmtDate(r.started_at, business.timezone)} · {r.workflow ?? r.trigger} · ${Number(r.cost_usd).toFixed(3)}</span></div>
                  {r.summary && <p className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-300">{r.summary}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="muted">Ο agent δεν έχει τρέξει ακόμα.</p>}
          <p className="muted mt-4 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
            Χρήση AI αυτόν τον μήνα (οργανισμός): ${Number(usage.data?.cost_usd ?? 0).toFixed(2)} · {usage.data?.runs ?? 0} εκτελέσεις
          </p>
        </section>
      </div>
      {!upcoming.data?.length && !runs.data?.length && (
        <div className="mt-6"><Empty title="Ξεκίνα συμπληρώνοντας το brand profile" href={`${base}/settings`} cta="Business Settings">
          Όσο περισσότερα ξέρει ο agent για την επιχείρηση, τόσο καλύτερο το περιεχόμενο.</Empty></div>
      )}
    </>
  );
}

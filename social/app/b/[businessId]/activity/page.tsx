import { requireBusinessAccess } from "@/lib/access";
import { userClient } from "@/lib/supabase/server";
import { PageHeader, Badge, StatusBadge, fmtDate } from "@/app/ui";

export default async function Activity({ params }: { params: { businessId: string } }) {
  const { business } = await requireBusinessAccess(params.businessId);
  const db = userClient();
  const [{ data: events }, { data: runs }, { data: jobs }] = await Promise.all([
    db.from("activity_log").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(100),
    db.from("agent_runs").select("id,trigger,workflow,status,error,started_at,finished_at,cost_usd,input_tokens,output_tokens,web_searches")
      .eq("business_id", business.id).order("started_at", { ascending: false }).limit(20),
    db.from("jobs").select("id,type,status,attempts,max_attempts,last_error,run_at,updated_at").eq("business_id", business.id)
      .order("updated_at", { ascending: false }).limit(20),
  ]);
  const tz = business.timezone;
  return (
    <>
      <PageHeader title="Activity log" subtitle="Append-only καταγραφή: δεν μπορεί να τροποποιηθεί ή να διαγραφεί." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">Εκτελέσεις agent</h2>
          <table className="w-full text-sm"><tbody>{(runs ?? []).map((r) => (
            <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-800">
              <td className="py-2 pr-2"><StatusBadge status={r.status} /></td>
              <td className="py-2 pr-2">{r.workflow ?? r.trigger}<p className="muted text-xs">{fmtDate(r.started_at, tz)}</p>
                {r.error && <p className="text-xs text-rose-600">{r.error}</p>}</td>
              <td className="muted py-2 text-right text-xs tabular-nums">${Number(r.cost_usd).toFixed(3)}<br />{r.input_tokens}/{r.output_tokens} tok<br />{r.web_searches} αναζ.</td>
            </tr>))}</tbody></table>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">Ουρά εργασιών</h2>
          <table className="w-full text-sm"><tbody>{(jobs ?? []).map((j) => (
            <tr key={j.id} className="border-t border-slate-100 align-top dark:border-slate-800">
              <td className="py-2 pr-2"><Badge tone={j.status === "succeeded" ? "green" : j.status === "queued" ? "indigo" : j.status === "running" ? "amber" : "red"}>{j.status}</Badge></td>
              <td className="py-2">{j.type}<p className="muted text-xs">προσπάθειες {j.attempts}/{j.max_attempts} · {fmtDate(j.updated_at, tz)}</p>
                {j.last_error && <p className="text-xs text-rose-600">{j.last_error}</p>}</td>
            </tr>))}</tbody></table>
        </section>
      </div>
      <section className="card mt-6 overflow-x-auto">
        <h2 className="mb-3 font-semibold">Συμβάντα</h2>
        <table className="w-full text-sm"><tbody>{(events ?? []).map((e) => (
          <tr key={e.id} className="border-t border-slate-100 align-top dark:border-slate-800">
            <td className="muted whitespace-nowrap py-2 pr-3 text-xs">{fmtDate(e.created_at, tz)}</td>
            <td className="py-2 pr-3"><Badge tone={e.actor_type === "agent" ? "indigo" : e.actor_type === "user" ? "green" : "slate"}>{e.actor_type}</Badge></td>
            <td className="py-2 font-mono text-xs">{e.action}</td>
            <td className="muted py-2 text-xs">{Object.keys(e.details ?? {}).length ? JSON.stringify(e.details).slice(0, 160) : ""}</td>
          </tr>))}</tbody></table>
      </section>
    </>
  );
}

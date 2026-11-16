import { getSettings } from "@/lib/settings";
import { userClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge, Empty, fmtDate } from "@/app/ui";
import { Decide } from "./decide";

export default async function Approvals() {
  const tz = (await getSettings())!.timezone;
  const db = userClient();
  const [{ data: pending }, { data: decided }] = await Promise.all([
    db.from("social_approvals").select("*").eq("status", "pending").order("created_at"),
    db.from("social_approvals").select("*").neq("status", "pending").order("decided_at", { ascending: false }).limit(20),
  ]);
  return (
    <>
      <PageHeader title="Εγκρίσεις" subtitle="Ενέργειες που ο agent δεν εκτελεί χωρίς εσένα. Οι απορρίψεις με αιτιολογία αποθηκεύονται στη μνήμη του agent." />
      {pending?.length ? (
        <div className="space-y-3">
          {pending.map((a) => (
            <div key={a.id} className="card">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status="pending" /><span className="muted text-xs">{a.action} · {fmtDate(a.created_at, tz)}</span></div>
              <p className="mt-2 font-medium">{a.summary}</p>
              {Object.keys(a.payload ?? {}).length > 0 && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/50">{JSON.stringify(a.payload, null, 2)}</pre>
              )}
              <Decide id={a.id} />
            </div>
          ))}
        </div>
      ) : <Empty title="Καμία εκκρεμότητα" />}
      {!!decided?.length && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold">Πρόσφατες αποφάσεις</h2>
          <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <StatusBadge status={a.status} /><span className="flex-1">{a.summary}</span>
                {a.note && <span className="muted">«{a.note}»</span>}
                <span className="muted text-xs">{fmtDate(a.decided_at, tz)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

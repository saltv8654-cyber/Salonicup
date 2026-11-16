import { getSettings } from "@/lib/settings";
import { userClient } from "@/lib/supabase/server";
import { INTEGRATIONS, integrationState, missingEnv } from "@/lib/integrations";
import { PageHeader, Badge, StatusBadge, fmtDate } from "@/app/ui";

const API_TONE = { yes: "green", limited: "amber", no: "red" } as const;
const API_LABEL = { yes: "Ναι", limited: "Περιορισμένα", no: "Όχι" } as const;

export default async function Accounts() {
  const tz = (await getSettings())!.timezone;
  const { data: accounts } = await userClient().from("social_accounts").select("*");
  const social = INTEGRATIONS.filter((i) => i.kind === "social");
  return (
    <>
      <PageHeader title="Social Accounts"
        subtitle="Η σύνδεση γίνεται με OAuth των επίσημων APIs (Phase 3). Τα tokens αποθηκεύονται κρυπτογραφημένα και δεν φτάνουν ποτέ στον browser." />
      <div className="grid gap-4 lg:grid-cols-2">
        {social.map((i) => {
          const mine = (accounts ?? []).filter((a) => i.id.includes(a.platform));
          const state = integrationState(i);
          return (
            <section key={i.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-semibold">{i.name}</h2>
                <StatusBadge status={state} />
              </div>
              {mine.length ? (
                <ul className="mt-3 space-y-1 text-sm">{mine.map((a) => (
                  <li key={a.id} className="flex items-center gap-2"><StatusBadge status={a.status === "connected" ? "active" : "failed"} />@{a.handle} <span className="muted text-xs">έλεγχος {fmtDate(a.last_checked_at, tz)}</span></li>
                ))}</ul>
              ) : (
                <p className="muted mt-2">Κανένας λογαριασμός. {state === "planned"
                  ? "Η σύνδεση υλοποιείται στη Phase 3."
                  : `Λείπουν: ${missingEnv(i).join(", ")}`}</p>
              )}
              <button className="btn-ghost mt-3" disabled title="Phase 3">Σύνδεση λογαριασμού</button>
              <table className="mt-4 w-full text-sm">
                <tbody>{i.capabilities?.map((c) => (
                  <tr key={c.name} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-2">{c.name}{c.note && <p className="muted text-xs">{c.note}</p>}</td>
                    <td className="py-1.5 text-right"><Badge tone={API_TONE[c.api]}>{API_LABEL[c.api]}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
              <ul className="muted mt-3 list-disc space-y-0.5 pl-5 text-xs">{i.limits.map((l) => <li key={l}>{l}</li>)}</ul>
              <p className="muted mt-2 text-xs">Κόστος: {i.cost}</p>
            </section>
          );
        })}
      </div>
    </>
  );
}

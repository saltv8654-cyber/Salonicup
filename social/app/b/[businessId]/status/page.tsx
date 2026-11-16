import { requireBusinessAccess } from "@/lib/access";
import { INTEGRATIONS, integrationState, missingEnv } from "@/lib/integrations";
import { PageHeader, StatusBadge, Badge } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function Status({ params }: { params: { businessId: string } }) {
  await requireBusinessAccess(params.businessId);
  return (
    <>
      <PageHeader title="Κατάσταση APIs & integrations"
        subtitle="Υπολογίζεται από την πραγματική ρύθμιση του server. «Δεν έχει υλοποιηθεί» σημαίνει ότι ο κώδικας δεν υπάρχει ακόμα — όχι ότι κρύβεται." />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-3">Integration</th><th className="p-3">Phase</th><th className="p-3">Κατάσταση</th><th className="p-3">Κόστος / όρια</th></tr></thead>
          <tbody>{INTEGRATIONS.map((i) => {
            const state = integrationState(i);
            const missing = i.implemented ? missingEnv(i) : [];
            return (
              <tr key={i.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="p-3 font-medium">{i.name}</td>
                <td className="p-3"><Badge>{i.phase}</Badge></td>
                <td className="p-3"><StatusBadge status={state} />{missing.length > 0 && <p className="mt-1 font-mono text-xs text-amber-600">{missing.join(", ")}</p>}</td>
                <td className="muted p-3 text-xs">{i.cost}{i.limits.length > 0 && <ul className="mt-1 list-disc pl-4">{i.limits.map((l) => <li key={l}>{l}</li>)}</ul>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </>
  );
}

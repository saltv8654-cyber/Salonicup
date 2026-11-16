import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function create(form: FormData) {
  "use server";
  const org = String(form.get("org") ?? "").trim();
  const business = String(form.get("business") ?? "").trim();
  const industry = String(form.get("industry") ?? "").trim() || null;
  if (!org || !business) return;
  const { data, error } = await userClient().rpc("create_organization", { p_org_name: org, p_business_name: business, p_industry: industry });
  if (error) throw new Error(error.message);
  redirect(`/b/${data}/settings?welcome=1`);
}

export default function Onboarding() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={create} className="card w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Ξεκινάμε</h1>
        <p className="muted">Ο οργανισμός είναι ο λογαριασμός σου (χρέωση, ομάδα). Κάθε επιχείρηση έχει δική της μνήμη, brand και λογαριασμούς — τα δεδομένα δεν αναμειγνύονται ποτέ.</p>
        <div><label className="label" htmlFor="org">Οργανισμός</label><input id="org" name="org" className="input" required maxLength={120} placeholder="π.χ. SALTV" /></div>
        <div><label className="label" htmlFor="business">Επιχείρηση</label><input id="business" name="business" className="input" required maxLength={120} placeholder="π.χ. Salonicup" /></div>
        <div><label className="label" htmlFor="industry">Κλάδος</label><input id="industry" name="industry" className="input" maxLength={120} placeholder="π.χ. ερασιτεχνικό πρωτάθλημα ποδοσφαίρου" /></div>
        <button className="btn-primary w-full">Δημιουργία</button>
      </form>
    </main>
  );
}

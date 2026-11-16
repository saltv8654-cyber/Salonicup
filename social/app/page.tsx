import Link from "next/link";
import { redirect } from "next/navigation";
import { userClient, supabaseConfigured } from "@/lib/supabase/server";
import { INTEGRATIONS, missingEnv } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!supabaseConfigured()) {
    const missing = INTEGRATIONS.filter((i) => i.phase === 1).flatMap((i) => missingEnv(i));
    return (
      <main className="mx-auto max-w-xl p-6 pt-16">
        <div className="card">
          <h1 className="text-xl font-semibold">Απαιτείται ρύθμιση</h1>
          <p className="muted mt-2">Λείπουν οι παρακάτω μεταβλητές περιβάλλοντος. Δες το README του φακέλου <code>social/</code>.</p>
          <ul className="mt-4 space-y-1 font-mono text-sm">{missing.map((k) => <li key={k}>• {k}</li>)}</ul>
        </div>
      </main>
    );
  }
  const db = userClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: businesses } = await db.from("businesses").select("id,name,industry,organizations(name)").order("created_at");
  if (!businesses?.length) redirect("/onboarding");
  if (businesses.length === 1) redirect(`/b/${businesses[0].id}`);
  return (
    <main className="mx-auto max-w-2xl p-6 pt-16">
      <h1 className="mb-4 text-2xl font-semibold">Επιχειρήσεις</h1>
      <div className="grid gap-3">
        {businesses.map((b) => (
          <Link key={b.id} href={`/b/${b.id}`} className="card hover:border-indigo-400">
            <p className="font-medium">{b.name}</p>
            <p className="muted">{(b.organizations as unknown as { name: string })?.name} · {b.industry ?? "—"}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

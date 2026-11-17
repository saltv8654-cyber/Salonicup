import { requireAdmin } from "@/lib/access";
import { getSettings } from "@/lib/settings";
import { supabaseConfigured, userClient } from "@/lib/supabase/server";
import { INTEGRATIONS, missingEnv } from "@/lib/integrations";
import { ThemeToggle } from "@/app/theme-toggle";
import { Badge } from "@/app/ui";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";
const MODE_LABEL = { manual: "Manual approval", semi: "Semi-autonomous", full: "Fully autonomous" } as const;

function Setup({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="mx-auto max-w-xl p-6 pt-16"><div className="card"><h1 className="text-xl font-semibold">{title}</h1>{children}</div></main>;
}

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured()) {
    const missing = INTEGRATIONS.filter((i) => i.phase === 1).flatMap((i) => missingEnv(i));
    return <Setup title="Απαιτείται ρύθμιση"><p className="muted mt-2">Λείπουν μεταβλητές περιβάλλοντος (δες το README του φακέλου <code>social/</code>):</p>
      <ul className="mt-4 space-y-1 font-mono text-sm">{missing.map((k) => <li key={k}>• {k}</li>)}</ul></Setup>;
  }
  const admin = await requireAdmin();
  const settings = await getSettings();
  if (!settings) {
    return <Setup title="Λείπει η βάση του agent"><p className="muted mt-2">Τρέξε το <code>social/supabase/migrations/0001_social.sql</code> στο Supabase → SQL Editor του Salonicup και ανανέωσε τη σελίδα.</p></Setup>;
  }
  const { count } = await userClient().from("social_approvals").select("id", { count: "exact", head: true }).eq("status", "pending");
  return (
    <div className="min-h-screen">
      <Nav pending={count ?? 0} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/80 px-4 py-3 pl-16 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 lg:pl-6">
          <div className="mr-auto min-w-0">
            <p className="truncate font-semibold">{settings.brand_name} · Social Agent</p>
            <p className="truncate text-xs text-slate-500">{admin.email}</p>
          </div>
          {settings.paused ? <Badge tone="red">⏸ Emergency stop</Badge> : <Badge tone="indigo">{MODE_LABEL[settings.autonomy_mode]}</Badge>}
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

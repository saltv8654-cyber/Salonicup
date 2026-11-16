import { requireBusinessAccess } from "@/lib/access";
import { userClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/app/theme-toggle";
import { Badge } from "@/app/ui";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";
const MODE_LABEL = { manual: "Manual approval", semi: "Semi-autonomous", full: "Fully autonomous" } as const;

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: { businessId: string } }) {
  const { business, org, role } = await requireBusinessAccess(params.businessId);
  const { count } = await userClient().from("approvals").select("id", { count: "exact", head: true })
    .eq("business_id", business.id).eq("status", "pending");
  const base = `/b/${business.id}`;
  return (
    <div className="min-h-screen">
      <Nav base={base} pending={count ?? 0} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/80 px-4 py-3 pl-16 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 lg:pl-6">
          <div className="mr-auto min-w-0">
            <p className="truncate font-semibold">{business.name}</p>
            <p className="truncate text-xs text-slate-500">{org.name} · {role}</p>
          </div>
          {!org.agent_enabled && <Badge tone="red">Agent απενεργοποιημένος</Badge>}
          {business.autonomy_paused ? <Badge tone="red">⏸ Emergency stop</Badge> : <Badge tone="indigo">{MODE_LABEL[business.autonomy_mode]}</Badge>}
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

import { serviceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { leagues, recentResults, upcomingMatches } from "@/lib/salonicup";
import { PageHeader } from "@/app/ui";
import { fmtShort } from "@/lib/graphics/theme";
import { Studio, type MatchOption } from "./studio";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const tz = (await getSettings())!.timezone;
  const db = serviceClient(); // public league data (the layout already checked the admin)
  const [ls, upcoming, recent, drafts] = await Promise.all([
    leagues(db).catch(() => []),
    upcomingMatches(db, 14).catch(() => []),
    recentResults(db, 21).catch(() => []),
    db.from("social_content").select("id,title,status").in("status", ["idea", "draft", "pending_approval", "approved", "scheduled"])
      .order("created_at", { ascending: false }).limit(40),
  ]);
  const opt = (m: { match_id: string; home?: string; away?: string; date: string | null; league?: string }, extra: string): MatchOption => ({
    id: m.match_id, label: `${fmtShort(m.date, tz)} · ${m.home} - ${m.away}${extra} · ${m.league ?? ""}`,
  });
  return (
    <>
      <PageHeader title="Creative Studio"
        subtitle="Γραφικά από τα πραγματικά δεδομένα του πρωταθλήματος, με το brand του Salonicup. Ονόματα, σκορ και λογότυπα έρχονται από τη βάση." />
      <Studio
        played={recent.map((m) => opt(m, ` (${m.score})`))}
        upcoming={upcoming.map((m) => opt(m, ""))}
        leagues={ls.map((l) => ({ id: l.league_id, label: l.name }))}
        drafts={(drafts.data ?? []).map((d) => ({ id: d.id, label: d.title }))}
      />
    </>
  );
}

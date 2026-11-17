import { serviceClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/ui";
import { athensDateKey, fmtDay, fmtTime } from "@/lib/posts/build";
import { Studio, type Option, type LeagueOption } from "./studio";

export const dynamic = "force-dynamic";

const STAGE: Record<string, string> = { QF: "Quarter finals", SF: "Semi finals", Final: "Final" };

export default async function StudioPage() {
  const db = serviceClient(); // public league data (the layout already checked the admin)
  const [{ data: leagues }, { data: matches }, { data: teams }, drafts] = await Promise.all([
    db.from("leagues").select("league_id,name").eq("active", true).order("sort_order"),
    db.from("matches").select("match_id,league_id,round,stage,match_date,match_status,team_a,team_b,goals_team_a,goals_team_b,mvp_player_id"),
    db.from("teams").select("team_id,name"),
    db.from("social_content").select("id,title").in("status", ["idea", "draft", "pending_approval", "approved", "scheduled"])
      .order("created_at", { ascending: false }).limit(40),
  ]);
  const team = new Map((teams ?? []).map((t) => [t.team_id, t.name as string]));
  const active = new Set((leagues ?? []).map((l) => l.league_id));
  const now = Date.now();
  const all = (matches ?? []).filter((m) => active.has(m.league_id) && m.match_date);
  const label = (m: (typeof all)[number], score: boolean) =>
    `${fmtDay(m.match_date)} ${score ? "" : fmtTime(m.match_date) + " "}· ${team.get(m.team_a) ?? "?"} ${score ? `${m.goals_team_a}-${m.goals_team_b}` : "-"} ${team.get(m.team_b) ?? "?"}`;
  const played = all.filter((m) => ["Played", "Forfeit"].includes(m.match_status) && new Date(m.match_date).getTime() > now - 45 * 86_400_000)
    .sort((a, b) => b.match_date.localeCompare(a.match_date));
  const upcoming = all.filter((m) => ["Scheduled", "Live"].includes(m.match_status) && new Date(m.match_date).getTime() < now + 30 * 86_400_000)
    .sort((a, b) => a.match_date.localeCompare(b.match_date));

  const leagueOptions: LeagueOption[] = (leagues ?? []).map((l) => {
    const lm = all.filter((m) => m.league_id === l.league_id);
    const rounds = [...new Set(lm.filter((m) => !m.stage).map((m) => m.round as number))].sort((a, b) => a - b)
      .map((r) => ({ id: String(r), label: `Αγωνιστική ${r}` }));
    for (const s of ["QF", "SF"]) if (lm.some((m) => m.stage === s)) rounds.push({ id: `${s}:1`, label: `Playoff · ${STAGE[s]} · 1ο ματς` }, { id: `${s}:2`, label: `Playoff · ${STAGE[s]} · 2ο ματς` });
    if (lm.some((m) => m.stage === "Final")) rounds.push({ id: "Final", label: "Playoff · Final" });
    return { id: l.league_id, label: l.name, rounds };
  });
  const opt = (m: (typeof all)[number], score: boolean): Option => ({ id: m.match_id, label: label(m, score), extra: m.mvp_player_id ? "mvp" : undefined });

  return (
    <>
      <PageHeader title="Creative Studio"
        subtitle="Τα σχέδια της καρτέλας «Posts» του Salonicup, με τα ίδια θέματα ανά πρωτάθλημα και τους χορηγούς. Τα ίδια φτιάχνει και ο agent." />
      <Studio
        leagues={leagueOptions}
        played={played.map((m) => opt(m, true))}
        upcoming={upcoming.map((m) => opt(m, false))}
        drafts={(drafts.data ?? []).map((d) => ({ id: d.id, label: d.title }))}
        today={athensDateKey(new Date().toISOString())}
      />
    </>
  );
}

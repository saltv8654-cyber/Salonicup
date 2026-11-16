import type { SupabaseClient } from "@supabase/supabase-js";

// Read-only access to the Salonicup league data that lives in the same database.
// This is the agent's primary source of real content: fixtures, results, scorers, standings, match reports.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function lookups(db: SupabaseClient, matches: Row[]) {
  const teamIds = [...new Set(matches.flatMap((m) => [m.team_a, m.team_b]))];
  const leagueIds = [...new Set(matches.map((m) => m.league_id))];
  const venueIds = [...new Set(matches.map((m) => m.venue_id).filter(Boolean))];
  const [teams, leagues, venues] = await Promise.all([
    teamIds.length ? db.from("teams").select("team_id,name").in("team_id", teamIds) : { data: [] },
    leagueIds.length ? db.from("leagues").select("league_id,name").in("league_id", leagueIds) : { data: [] },
    venueIds.length ? db.from("venues").select("venue_id,name").in("venue_id", venueIds) : { data: [] },
  ]);
  const name = (rows: Row[] | null, key: string) => new Map((rows ?? []).map((r) => [r[key], r.name as string]));
  return { team: name(teams.data, "team_id"), league: name(leagues.data, "league_id"), venue: name(venues.data, "venue_id") };
}

const MATCH_FIELDS = "match_id,league_id,round,stage,match_date,venue_id,field,team_a,team_b,goals_team_a,goals_team_b,pens_team_a,pens_team_b,match_status,mvp_player_id,report,stream_url";

export async function upcomingMatches(db: SupabaseClient, days = 7) {
  const now = new Date();
  const { data, error } = await db.from("matches").select(MATCH_FIELDS)
    .in("match_status", ["Scheduled", "Live"])
    .gte("match_date", new Date(now.getTime() - 3 * 3_600_000).toISOString())
    .lte("match_date", new Date(now.getTime() + days * 86_400_000).toISOString())
    .order("match_date").limit(60);
  if (error) throw new Error(error.message);
  const m = data ?? [];
  const l = await lookups(db, m);
  return m.map((x) => ({
    match_id: x.match_id, league: l.league.get(x.league_id), round: x.round, stage: x.stage ?? "regular",
    date: x.match_date, venue: l.venue.get(x.venue_id) ?? null, field: x.field,
    home: l.team.get(x.team_a), away: l.team.get(x.team_b), status: x.match_status, stream_url: x.stream_url ?? null,
  }));
}

export async function recentResults(db: SupabaseClient, days = 7) {
  const { data, error } = await db.from("matches").select(MATCH_FIELDS)
    .in("match_status", ["Played", "Forfeit"])
    .gte("match_date", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("match_date", { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  const m = data ?? [];
  const l = await lookups(db, m);
  const ids = m.map((x) => x.match_id);
  const { data: events } = ids.length
    ? await db.from("events").select("match_id,team_id,player_id,event_type,period,minute")
      .in("match_id", ids).in("event_type", ["GOAL", "OWN", "RED"])
    : { data: [] as Row[] };
  const playerIds = [...new Set([...(events ?? []).map((e) => e.player_id), ...m.map((x) => x.mvp_player_id).filter(Boolean)])];
  const { data: players } = playerIds.length
    ? await db.from("players").select("player_id,full_name").in("player_id", playerIds)
    : { data: [] as Row[] };
  const player = new Map((players ?? []).map((p) => [p.player_id, p.full_name as string]));

  return m.map((x) => {
    const ev = (events ?? []).filter((e) => e.match_id === x.match_id && e.period !== "PEN");
    const line = (e: Row) => `${player.get(e.player_id) ?? "?"}${e.minute ? ` ${e.minute}'` : ""}${e.event_type === "OWN" ? " (αυτογκόλ)" : ""}`;
    return {
      match_id: x.match_id, league: l.league.get(x.league_id), round: x.round, stage: x.stage ?? "regular", date: x.match_date,
      home: l.team.get(x.team_a), away: l.team.get(x.team_b),
      score: `${x.goals_team_a}-${x.goals_team_b}${x.pens_team_a || x.pens_team_b ? ` (πέν. ${x.pens_team_a}-${x.pens_team_b})` : ""}`,
      forfeit: x.match_status === "Forfeit",
      // OWN goals count for the other team; the speaker stores them with the scorer's own team_id.
      home_scorers: ev.filter((e) => (e.event_type === "GOAL" && e.team_id === x.team_a) || (e.event_type === "OWN" && e.team_id === x.team_b)).map(line),
      away_scorers: ev.filter((e) => (e.event_type === "GOAL" && e.team_id === x.team_b) || (e.event_type === "OWN" && e.team_id === x.team_a)).map(line),
      red_cards: ev.filter((e) => e.event_type === "RED").map(line),
      mvp: x.mvp_player_id ? player.get(x.mvp_player_id) ?? null : null,
      report_excerpt: x.report ? String(x.report).slice(0, 700) : null,
      stream_url: x.stream_url ?? null,
    };
  });
}

export async function leagues(db: SupabaseClient) {
  const { data, error } = await db.from("leagues").select("league_id,name,season").eq("active", true).order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function standings(db: SupabaseClient, leagueId?: string) {
  let q = db.from("standings").select("league_id,position,team_name,played,wins,draws,losses,goals_for,goals_against,goal_diff,points");
  if (leagueId) q = q.eq("league_id", leagueId);
  const [{ data, error }, ls] = await Promise.all([q.order("league_id").order("position").limit(200), leagues(db)]);
  if (error) throw new Error(error.message);
  const name = new Map(ls.map((x) => [x.league_id, x.name]));
  return (data ?? []).filter((r) => name.has(r.league_id)).map(({ league_id, ...r }) => ({ league: name.get(league_id), ...r }));
}

export async function topScorers(db: SupabaseClient, limit = 10) {
  const ls = await leagues(db);
  const out: Row[] = [];
  for (const l of ls) {
    const { data, error } = await db.from("player_stats").select("full_name,team_name,goals,assists,mvp_awards,appearances")
      .eq("league_id", l.league_id).gt("goals", 0).order("goals", { ascending: false }).order("assists", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    out.push({ league: l.name, scorers: data ?? [] });
  }
  return out;
}

/** One-line summary for the system prompt; the agent fetches details with a tool. */
export async function snapshot(db: SupabaseClient): Promise<string> {
  try {
    const [ls, upcoming, recent] = await Promise.all([leagues(db), upcomingMatches(db, 7), recentResults(db, 7)]);
    return `Ενεργά πρωταθλήματα: ${ls.map((l) => l.name).join(", ") || "—"}. Αγώνες επόμενων 7 ημερών: ${upcoming.length}. Αποτελέσματα τελευταίων 7 ημερών: ${recent.length}.`;
  } catch (e) {
    return `Τα δεδομένα του πρωταθλήματος δεν διαβάστηκαν (${(e as Error).message}).`;
  }
}

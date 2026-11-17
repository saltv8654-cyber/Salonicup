// Renders the Salonicup "Posts" tab designs on the server, with the SAME drawing code (canvas.ts)
// and the SAME data rules (build.ts) as app/admin/post. Only data loading and fonts live here.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import type { SupabaseClient } from "@supabase/supabase-js";
import { drawPost, type PostData } from "./canvas";
import {
  athensDateKey, buildFinal, buildMvp, buildOddsGroups, buildRoundGroups, buildVersus, buildWeekGroups,
  fmtDay, matchSub, roundSub, themeForLeague, type MatchEvent,
} from "./build";

import { POST_FORMATS, POST_TYPES, type PostFormat, type PostType } from "./meta";
export { POST_FORMATS, POST_TYPES, type PostFormat, type PostType };
/** Like the Posts tab: these layouts are drawn 1080 wide. Schedule/results only square; standings also as a story. */
const SQUARE_ONLY: PostType[] = ["schedule", "results"];
const NO_LANDSCAPE: PostType[] = ["standings"];

export interface PostSpec {
  type: PostType;
  format?: PostFormat;
  league_id?: string;
  match_id?: string;
  /** schedule/results: "9" (round), "QF:1", "SF:2", "Final" */
  round?: string;
  /** schedule/results: a day instead of a round, YYYY-MM-DD */
  day?: string;
  /** week: any date inside the week, YYYY-MM-DD */
  week_date?: string;
  week_mode?: "program" | "results";
  league_ids?: string[];
  sponsors?: boolean;
}

/** The data does not support this post (e.g. Final Score for a match that has not been played). */
export class PostError extends Error {}

export interface RenderedPost { png: Buffer; width: number; height: number; title: string; match_id: string | null; format: PostFormat; post: PostData }

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// Fonts: Oswald (as in the browser) + Roboto Condensed for Greek, registered under the
// fallback name the drawing code already asks for ('Oswald, "Arial Narrow", sans-serif').
// ---------------------------------------------------------------------------
const FONTS = path.join(process.cwd(), "public/fonts");
let fontsReady: Promise<void> | null = null;
function registerFonts() {
  return (fontsReady ??= (async () => {
    for (const w of [500, 600, 700]) {
      GlobalFonts.register(await readFile(path.join(FONTS, `oswald-latin-${w}-normal.woff2`)), "Oswald");
      GlobalFonts.register(await readFile(path.join(FONTS, `oswald-latin-ext-${w}-normal.woff2`)), "Oswald");
      GlobalFonts.register(await readFile(path.join(FONTS, `roboto-condensed-greek-${w}-normal.woff2`)), "Arial Narrow");
    }
  })());
}

function imageLoader(fetcher: typeof fetch) {
  return async (url: string): Promise<Image | null> => {
    try {
      let buf: Buffer;
      if (url.startsWith("data:")) {
        const comma = url.indexOf(",");
        buf = Buffer.from(url.slice(comma + 1), url.slice(0, comma).includes("base64") ? "base64" : "utf8");
      } else if (/^https?:\/\//.test(url)) {
        const res = await fetcher(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        buf = Buffer.from(await res.arrayBuffer());
      } else return null;
      if (buf.length > 8_000_000) return null;
      return await loadImage(buf); // PNG, JPEG, WebP, GIF, SVG
    } catch {
      return null; // missing logo → the design draws the initial instead
    }
  };
}

// ---------------------------------------------------------------------------
// Data, in the shape the Posts tab uses (team_a_data, team_b_data, league)
// ---------------------------------------------------------------------------
function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

async function withTeams(db: SupabaseClient, matches: Row[]): Promise<Row[]> {
  const teamIds = [...new Set(matches.flatMap((m) => [m.team_a, m.team_b]))];
  const leagueIds = [...new Set(matches.map((m) => m.league_id))];
  const [teams, leagues] = await Promise.all([
    teamIds.length ? db.from("teams").select("team_id,name,logo_url").in("team_id", teamIds) : { data: [], error: null },
    leagueIds.length ? db.from("leagues").select("league_id,name,logo_url,sort_order,season").in("league_id", leagueIds) : { data: [], error: null },
  ]);
  const t = new Map(check<Row[]>(teams).map((x) => [x.team_id, { name: x.name, logo_url: x.logo_url ?? null }]));
  const l = new Map(check<Row[]>(leagues).map((x) => [x.league_id, x]));
  return matches.map((m) => ({ ...m, team_a_data: t.get(m.team_a) ?? null, team_b_data: t.get(m.team_b) ?? null, league: l.get(m.league_id) ?? null }));
}

const leagueMatches = async (db: SupabaseClient, leagueId: string) =>
  withTeams(db, check<Row[]>(await db.from("matches").select("*").eq("league_id", leagueId).order("match_date")));

async function activeLeagues(db: SupabaseClient): Promise<Row[]> {
  return check<Row[]>(await db.from("leagues").select("league_id,name,logo_url,season,sort_order,active").eq("active", true).order("sort_order"));
}

async function sponsorUrls(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("app_settings").select("sponsors").eq("id", 1).maybeSingle();
  return ((data?.sponsors as string[] | undefined) ?? []).filter(Boolean);
}

/** Default round like a person would pick: latest played (results) or next to be played (schedule). */
function defaultRound(matches: Row[], kind: "schedule" | "results"): string | null {
  const regular = matches.filter((m) => !m.stage && m.match_date);
  if (kind === "results") {
    const played = regular.filter((m) => ["Played", "Forfeit"].includes(m.match_status)).sort((a, b) => b.match_date.localeCompare(a.match_date));
    return played[0] ? String(played[0].round) : null;
  }
  const next = regular.filter((m) => ["Scheduled", "Live"].includes(m.match_status)).sort((a, b) => a.match_date.localeCompare(b.match_date));
  return next[0] ? String(next[0].round) : null;
}

// ---------------------------------------------------------------------------
export async function renderPost(db: SupabaseClient, spec: PostSpec, fetcher: typeof fetch = fetch): Promise<RenderedPost> {
  const info = POST_TYPES[spec.type];
  if (!info) throw new PostError("Άγνωστος τύπος post");
  const format: PostFormat = SQUARE_ONLY.includes(spec.type) || (NO_LANDSCAPE.includes(spec.type) && spec.format === "yt") ? "square" : spec.format ?? "square";
  const size = POST_FORMATS[format];
  const sponsors = spec.sponsors === false ? [] : await sponsorUrls(db);
  const leagues = await activeLeagues(db);
  let data: PostData;
  let title: string = info.label;
  let matchId: string | null = null;

  if (info.needs === "match") {
    if (!spec.match_id) throw new PostError("Χρειάζεται αγώνας (match_id)");
    const { data: one } = await db.from("matches").select("*").eq("match_id", spec.match_id).maybeSingle();
    if (!one) throw new PostError("Ο αγώνας δεν βρέθηκε");
    const all = await leagueMatches(db, one.league_id);
    const m = all.find((x) => x.match_id === one.match_id)!;
    const league = m.league ?? {};
    const played = ["Played", "Forfeit"].includes(m.match_status);
    matchId = m.match_id;
    title = `${info.label}: ${m.team_a_data?.name ?? "?"} - ${m.team_b_data?.name ?? "?"}`;
    const base = { leagueName: league.name ?? "", leagueLogo: league.logo_url ?? null, groups: [], standings: [], sponsors, theme: themeForLeague(league.name) };

    if (spec.type === "versus") {
      if (played) throw new PostError("Ο αγώνας έχει ήδη παιχτεί — για αποτέλεσμα χρησιμοποίησε «Τελικό σκορ»");
      const standings = check<Row[]>(await db.from("standings").select("*").eq("league_id", m.league_id).order("position"));
      data = { ...base, type: "versus", sub: league.season ?? "", typeLabel: "Αναμέτρηση", versus: buildVersus(m, all, standings) };
    } else {
      if (!played) throw new PostError(`Ο αγώνας δεν έχει ολοκληρωθεί (κατάσταση: ${m.match_status})`);
      const events = check<MatchEvent[]>(await db.from("events").select("team_id,player_id,event_type,period,minute").eq("match_id", m.match_id));
      const ids = [...new Set([...events.map((e) => e.player_id), m.mvp_player_id].filter(Boolean))];
      const players = ids.length ? check<Row[]>(await db.from("players").select("player_id,full_name,photo_url,team_id").in("player_id", ids)) : [];
      const pm = new Map(players.map((p) => [p.player_id, p]));
      const mvp = m.mvp_player_id ? pm.get(m.mvp_player_id) : null;
      const sub = matchSub(m, league.season ?? "");
      if (spec.type === "mvp") {
        if (!mvp) throw new PostError("Δεν έχει οριστεί MVP για αυτόν τον αγώνα");
        data = { ...base, type: "mvp", sub, typeLabel: "MVP", mvp: buildMvp(m, mvp as never, events) };
      } else {
        data = { ...base, type: "final", sub, typeLabel: "Τελικό", final: buildFinal(m, events, (id) => pm.get(id)?.full_name ?? "?", all, mvp?.full_name) };
      }
    }
  } else if (info.needs === "league") {
    const league = (spec.league_id ? leagues.find((l) => l.league_id === spec.league_id) : leagues[0]);
    if (!league) throw new PostError("Δεν βρέθηκε ενεργό πρωτάθλημα");
    title = `${info.label} · ${league.name}`;
    const base = { leagueName: league.name, leagueLogo: league.logo_url ?? null, sponsors, theme: themeForLeague(league.name), typeLabel: info.label };
    if (spec.type === "standings") {
      const rows = check<Row[]>(await db.from("standings").select("*").eq("league_id", league.league_id).order("position"));
      if (!rows.length) throw new PostError("Δεν υπάρχει βαθμολογία ακόμα");
      data = { ...base, type: "standings", sub: league.season ?? "", groups: [], standings: rows.slice(0, 16).map((t) => ({
        position: t.position, name: t.team_name, logo: t.logo_url, played: t.played, wins: t.wins, draws: t.draws, losses: t.losses, gd: t.goal_diff, points: t.points,
      })) };
    } else {
      const kind = spec.type as "schedule" | "results";
      const matches = await leagueMatches(db, league.league_id);
      const sel = spec.day
        ? { scope: "day" as const, day: spec.day, round: "" }
        : { scope: "round" as const, day: "", round: spec.round ?? defaultRound(matches, kind) ?? "" };
      const groups = buildRoundGroups(matches, kind, sel);
      if (!groups.length) throw new PostError(kind === "schedule" ? "Δεν υπάρχουν προγραμματισμένοι αγώνες στην επιλογή" : "Δεν υπάρχουν αποτελέσματα στην επιλογή");
      title += sel.scope === "day" ? ` · ${sel.day}` : ` · ${sel.round}`;
      data = { ...base, type: kind, sub: roundSub(sel, league.season ?? ""), groups, standings: [] };
    }
  } else if (info.needs === "week") {
    const ids = spec.league_ids?.length ? spec.league_ids : leagues.map((l) => l.league_id);
    const sel = leagues.filter((l) => ids.includes(l.league_id));
    if (!sel.length) throw new PostError("Δεν βρέθηκαν πρωταθλήματα");
    const multi = sel.length > 1;
    const raw = check<Row[]>(await db.from("matches").select("*").in("league_id", sel.map((l) => l.league_id)));
    const mode = spec.week_mode ?? "program";
    const { groups, range } = buildWeekGroups(await withTeams(db, raw.filter((m) => m.match_date)), spec.week_date ?? athensDateKey(new Date().toISOString()), mode, multi);
    if (!groups.length) throw new PostError(`Δεν υπάρχουν ${mode === "results" ? "αποτελέσματα" : "αγώνες"} αυτή την εβδομάδα`);
    const one = sel[0];
    title = `Εβδομάδα · ${range}`;
    data = {
      type: "week", leagueName: multi ? "Πρόγραμμα Εβδομάδας" : one.name, sub: multi ? range : `${range}${one.season ? " · " + one.season : ""}`,
      typeLabel: mode === "results" ? "Αποτελέσματα" : "Πρόγραμμα", leagueLogo: multi ? null : one.logo_url ?? null,
      groups, standings: [], sponsors, theme: themeForLeague(multi ? undefined : one.name),
    };
  } else {
    const day = spec.day ?? athensDateKey(new Date().toISOString());
    // All matches (any status), like the Posts tab: the playoff leg numbering needs the earlier legs too.
    const all = await withTeams(db, check<Row[]>(await db.from("matches").select("*")).filter((m) => m.match_date));
    const ids = all.filter((m) => ["Scheduled", "Live"].includes(m.match_status) && athensDateKey(m.match_date) === day).map((m) => m.match_id);
    if (!ids.length) throw new PostError("Δεν υπάρχουν αγώνες αυτή την ημέρα");
    const odds = check<{ match_id: string; home: unknown; draw: unknown; away: unknown }[]>(await db.from("bet_odds").select("match_id,home,draw,away").in("match_id", ids));
    title = `Αποδόσεις · ${day}`;
    data = {
      type: "odds", leagueName: "SALONICUP BET", sub: fmtDay(new Date(`${day}T12:00:00`).toISOString()), typeLabel: "Αποδόσεις",
      leagueLogo: null, groups: buildOddsGroups(all, day, odds), standings: [], sponsors, theme: "liga",
    };
  }

  await registerFonts();
  const canvas = createCanvas(size.w, size.h);
  // Same call as the Posts tab for the square layouts (no explicit size).
  await drawPost(canvas, data, format === "square" && [...SQUARE_ONLY, ...NO_LANDSCAPE].includes(spec.type) ? undefined : { w: size.w, h: size.h }, { loadImage: imageLoader(fetcher), emoji: false });
  return { png: canvas.toBuffer("image/png"), width: canvas.width, height: canvas.height, title, match_id: matchId, format, post: data };
}

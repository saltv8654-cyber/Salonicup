// The agent's posts: same code as the Salonicup "Posts" tab, real league data, every type and size.
// Set GRAPHICS_OUT=<dir> to also write the PNGs for a visual check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fakeDb } from "./fake-db.ts";
import { renderPost, PostError, POST_TYPES, POST_FORMATS, type PostSpec, type PostType } from "../lib/posts/render.ts";
import { buildFinal, buildRoundGroups, fmtMinute, weekDays } from "../lib/posts/build.ts";
import { executeTool, type ToolCtx } from "../lib/agent/tools.ts";

test("the agent uses exactly the Posts tab code (run `npm run sync:posts` after changing it)", () => {
  for (const f of ["canvas.ts", "build.ts"]) {
    const tab = path.join(process.cwd(), "../app/admin/post", f);
    if (!existsSync(tab)) return; // repository without the main app
    assert.equal(readFileSync(path.join(process.cwd(), "lib/posts", f), "utf8"), readFileSync(tab, "utf8"), `${f} differs from the Posts tab`);
  }
});

test("minutes as the app shows them", () => {
  assert.equal(fmtMinute("H1", 12), "12'");
  assert.equal(fmtMinute("H1", 33), "30+3'");
  assert.equal(fmtMinute("H2", 5), "35'");
  assert.equal(fmtMinute("H2", 32), "60+2'");
  assert.equal(fmtMinute("ET", 3), "63'");
});

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = Date.now();
const iso = (h: number) => new Date(now + h * 3_600_000).toISOString();
const LOGO = "https://cdn.test/spartans.png";
const SPONSOR = "https://cdn.test/sponsor.png";

function seed() {
  const names = ["Spartans", "ES Pylaia", "Θερμαϊκός United", "Real Kalamaria", "Αετοί Τούμπας", "FC Ladadika"];
  const teams = names.map((name, i) => ({ team_id: U(100 + i), league_id: U(1), name, logo_url: i === 0 ? LOGO : null }));
  const m = (id: number, a: number, b: number, status: string, h: number, ga = 0, gb = 0, extra = {}) => ({
    match_id: U(id), league_id: U(1), round: 9, stage: null, match_date: iso(h), venue_id: null, field: "Γήπ. 3",
    team_a: U(100 + a), team_b: U(100 + b), goals_team_a: ga, goals_team_b: gb, pens_team_a: 0, pens_team_b: 0,
    match_status: status, mvp_player_id: null, report: null, stream_url: null, ...extra,
  });
  return {
    leagues: [{ league_id: U(1), name: "Master League", season: "2026-27", logo_url: null, active: true, sort_order: 1 }],
    teams,
    matches: [
      m(10, 0, 1, "Played", -20, 3, 2, { mvp_player_id: U(201) }),
      m(11, 2, 3, "Played", -26, 1, 1),
      m(12, 4, 5, "Scheduled", 30, 0, 0, { round: 10 }),
      m(13, 0, 2, "Scheduled", 54, 0, 0, { round: 10 }),
      m(14, 1, 3, "Played", -24 * 9, 2, 0, { round: 8 }),
    ],
    events: [
      { match_id: U(10), team_id: U(100), player_id: U(201), event_type: "GOAL", period: "H1", minute: 7 },
      { match_id: U(10), team_id: U(100), player_id: U(201), event_type: "GOAL", period: "H2", minute: 18 },
      { match_id: U(10), team_id: U(101), player_id: U(202), event_type: "GOAL", period: "H1", minute: 22 },
      { match_id: U(10), team_id: U(101), player_id: U(203), event_type: "OWN", period: "H2", minute: 28 },
      { match_id: U(10), team_id: U(101), player_id: U(204), event_type: "GOAL", period: "H2", minute: 31 },
      { match_id: U(10), team_id: U(100), player_id: U(205), event_type: "ASSIST", period: "H2", minute: 18 },
    ],
    players: [
      { player_id: U(201), full_name: "Γιάννης Παπαδόπουλος", photo_url: null, team_id: U(100) },
      { player_id: U(202), full_name: "Νίκος Κ.", photo_url: null, team_id: U(101) },
      { player_id: U(203), full_name: "Κώστας Αυτογκολίδης", photo_url: null, team_id: U(101) },
      { player_id: U(204), full_name: "Μιχάλης", photo_url: null, team_id: U(101) },
    ],
    standings: teams.map((t, i) => ({ league_id: U(1), team_id: t.team_id, position: i + 1, team_name: t.name, logo_url: t.logo_url, played: 9,
      wins: 6 - i, draws: i % 3, losses: i, goals_for: 25 - 2 * i, goals_against: 8 + i, goal_diff: 17 - 3 * i, points: 20 - 3 * i })),
    bet_odds: [{ match_id: U(12), home: 1.85, draw: 3.4, away: 2.9 }],
    app_settings: [{ id: 1, sponsors: [SPONSOR] }],
  };
}

let png: Buffer;
const fetcher = (async (url: string) => {
  png ??= await readFile(path.join(process.cwd(), "../public/icon-192.png")).catch(() => Buffer.alloc(0));
  return [LOGO, SPONSOR].includes(url) && png.length
    ? new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } })
    : new Response("no", { status: 404 });
}) as typeof fetch;

const athensDay = (h: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(now + h * 3_600_000));
const SPEC: Record<PostType, Partial<PostSpec>> = {
  final: { match_id: U(10) }, mvp: { match_id: U(10) }, versus: { match_id: U(12) },
  schedule: {}, results: {}, standings: {},
  week: { week_date: athensDay(30), week_mode: "program" }, odds: { day: athensDay(30) },
};
const sizeOf = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

for (const type of Object.keys(POST_TYPES) as PostType[]) {
  test(`renders ${type}`, async () => {
    const { db } = fakeDb(seed());
    for (const format of Object.keys(POST_FORMATS) as (keyof typeof POST_FORMATS)[]) {
      const r = await renderPost(db, { type, format, ...SPEC[type] } as PostSpec, fetcher);
      const expected = ["schedule", "results", "standings"].includes(type) ? POST_FORMATS.square : POST_FORMATS[format];
      assert.deepEqual(sizeOf(r.png), { w: expected.w, h: expected.h }, `${type}/${format}`);
      assert.ok(r.png.length > 20_000, `${type}/${format} has content`);
      if (process.env.GRAPHICS_OUT) {
        await mkdir(process.env.GRAPHICS_OUT, { recursive: true });
        await writeFile(path.join(process.env.GRAPHICS_OUT, `${type}-${r.format}.png`), r.png);
      }
    }
  });
}

test("final score: scorers per team in match order, own goal to the other team, real minutes", async () => {
  const { tables } = fakeDb(seed());
  const m = { ...tables.matches[0], team_a_data: { name: "Spartans" }, team_b_data: { name: "ES Pylaia" } };
  const name = (id: string) => tables.players.find((p) => p.player_id === id)!.full_name;
  const f = buildFinal(m, tables.events as never, name, [], "Γιάννης Παπαδόπουλος");
  assert.deepEqual(f.homeScorers, ["Γιάννης Παπαδόπουλος 7'", "Γιάννης Παπαδόπουλος 48'", "Κώστας Αυτογκολίδης 58' (αυτ.)"]);
  assert.deepEqual(f.awayScorers, ["Νίκος Κ. 22'", "Μιχάλης 60+1'"]);
  assert.equal(f.mvp, "Γιάννης Παπαδόπουλος");
});

test("schedule/results pick the round a person would", async () => {
  const { db } = fakeDb(seed());
  assert.match((await renderPost(db, { type: "results" }, fetcher)).title, /· 9$/);
  assert.match((await renderPost(db, { type: "schedule" }, fetcher)).title, /· 10$/);
  assert.equal(buildRoundGroups(seed().matches.map((x) => ({ ...x, team_a_data: null, team_b_data: null })), "results", { scope: "round", round: "8", day: "" })
    .flatMap((g) => g.matches).length, 1);
  assert.equal(weekDays("2026-11-18")[0].key, "2026-11-16"); // Monday
});

test("refuses posts the data does not support", async () => {
  const { db } = fakeDb(seed());
  await assert.rejects(renderPost(db, { type: "final", match_id: U(12) }, fetcher), /δεν έχει ολοκληρωθεί/);
  await assert.rejects(renderPost(db, { type: "versus", match_id: U(10) }, fetcher), /έχει ήδη παιχτεί/);
  await assert.rejects(renderPost(db, { type: "mvp", match_id: U(11) }, fetcher), /MVP/);
  await assert.rejects(renderPost(db, { type: "final", match_id: U(99) }, fetcher), PostError);
  await assert.rejects(renderPost(db, { type: "odds", day: "2020-01-01" }, fetcher), /Δεν υπάρχουν αγώνες/);
});

test("agent tool: create_graphic stores the PNG and attaches it to the draft", async () => {
  const DRAFT = U(500);
  const data = seed();
  data.teams.forEach((t) => (t.logo_url = null));
  data.app_settings = [{ id: 1, sponsors: [] }];
  const { db, tables, uploads } = fakeDb({ ...data, social_content: [{ id: DRAFT, title: "Final Score", status: "draft", asset_ids: [] }] });
  const ctx: ToolCtx = { db, runId: "run-1", trigger: "chat", userId: "u1", mode: "manual", paused: false, timezone: "Europe/Athens", callSpecialist: async () => "" };
  const r = await executeTool(ctx, "create_graphic", { type: "final", format: "story", match_id: U(10), content_id: DRAFT });
  assert.equal(r.output.status, "created", JSON.stringify(r.output));
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].path, /^generated\/\d{4}-\d{2}\/final-story-/);
  assert.equal(tables.social_assets[0].match_id, U(10));
  assert.deepEqual(tables.social_content[0].asset_ids, [tables.social_assets[0].id]);
  const u = await executeTool(ctx, "create_graphic", { type: "final", match_id: U(12) });
  assert.equal(u.output.status, "unavailable");
  assert.equal(uploads.length, 1);
});

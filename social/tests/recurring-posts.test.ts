// Recurring posts per league: Thursday programme, Monday standings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./fake-db.ts";
import { runRecurringPosts, targetMonday, weeklyCaption, standingsCaption } from "../lib/jobs/recurring-posts.ts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const THURSDAY = new Date("2026-11-19T10:00:00Z"); // Πέμπτη 19/11, 12:00 Ελλάδα

function seed(mode = "manual", paused = false) {
  const team = (i: number, league: number) => ({ team_id: U(100 + i), league_id: U(league), name: ["Spartans", "ES Pylaia", "Θερμαϊκός", "Real Kalamaria"][i], logo_url: null });
  const m = (id: number, a: number, b: number, iso: string, extra = {}) => ({
    match_id: U(id), league_id: U(1), round: 10, stage: null, match_date: iso, field: "Γήπ. 3", team_a: U(100 + a), team_b: U(100 + b),
    goals_team_a: 0, goals_team_b: 0, pens_team_a: 0, pens_team_b: 0, match_status: "Scheduled", mvp_player_id: null, ...extra,
  });
  return {
    social_settings: [{ id: true, autonomy_mode: mode, paused, hashtags: ["salonicup"] }],
    leagues: [
      { league_id: U(1), name: "Master League", season: "2026-27", logo_url: null, active: true, sort_order: 1 },
      { league_id: U(2), name: "Liga", season: "2026-27", logo_url: null, active: true, sort_order: 2 },
    ],
    teams: [team(0, 1), team(1, 1), team(2, 1), team(3, 1)],
    matches: [
      m(10, 0, 1, "2026-11-23T19:00:00Z"),               // Δευτέρα 23/11 21:00
      m(11, 2, 3, "2026-11-25T18:00:00Z", { field: "Γήπ. 1" }), // Τετάρτη 25/11 20:00
      m(12, 0, 2, "2026-11-20T19:00:00Z"),               // this week: not in the next-week post
      m(13, 1, 3, "2026-11-24T19:00:00Z", { match_status: "Played" }),
    ],
    app_settings: [{ id: 1, sponsors: [] }],
    social_content: [] as Record<string, unknown>[],
    standings: [0, 1, 2, 3].map((i) => ({ league_id: U(1), team_id: U(100 + i), position: i + 1, team_name: ["Spartans", "ES Pylaia", "Θερμαϊκός", "Real Kalamaria"][i],
      logo_url: null, played: 9, wins: 6 - i, draws: 1, losses: i, goals_for: 20 - i, goals_against: 8 + i, goal_diff: 12 - 2 * i, points: 19 - 3 * i })),
  };
}

test("which week: next Monday by default, or the current one", () => {
  assert.equal(targetMonday(THURSDAY), "2026-11-23");
  assert.equal(targetMonday(THURSDAY, "current"), "2026-11-16");
  assert.equal(targetMonday(new Date("2026-11-22T21:30:00Z")), "2026-11-23"); // Sunday 23:30 Athens is still the week of 16/11
  assert.equal(targetMonday(new Date("2026-11-22T22:30:00Z")), "2026-11-30"); // Monday 00:30 Athens
});

test("manual mode: one post per league with matches, waiting for approval", async () => {
  const { db, tables, uploads } = fakeDb(seed("manual"));
  const r = await runRecurringPosts(db, "weekly_program", { trigger: "schedule", now: THURSDAY });
  assert.equal(r.week_start, "2026-11-23");
  assert.deepEqual(r.created.map((c) => [c.league, c.status]), [["Master League", "pending_approval"]]);
  assert.deepEqual(r.skipped.map((s) => s.league), ["Liga"]);
  const item = tables.social_content[0];
  assert.equal(item.source_key, `weekly_program:${U(1)}:2026-11-23`);
  assert.deepEqual(item.platforms, ["instagram", "facebook"]);
  assert.equal(uploads.length, 2, "square + story");
  assert.match(uploads[0].path, /week-square-/);
  assert.match(uploads[1].path, /week-story-/);
  assert.equal((item.asset_ids as string[]).length, 2);
  assert.equal(tables.social_approvals.length, 1);
  assert.equal(tables.social_approvals[0].target_id, item.id);
  // Caption: the two scheduled matches of next week only, with Athens times.
  const caption = String(item.caption);
  assert.match(caption, /Master League/);
  assert.match(caption, /21:00 Spartans – ES Pylaia \(Γήπ\. 3\)/);
  assert.match(caption, /20:00 Θερμαϊκός – Real Kalamaria \(Γήπ\. 1\)/);
  assert.doesNotMatch(caption, /Spartans – Θερμαϊκός/, "this week's match is not included");
  assert.match(caption, /#salonicup #masterleague/);
});

test("running again does not create duplicates", async () => {
  const { db, tables, uploads } = fakeDb(seed("manual"));
  await runRecurringPosts(db, "weekly_program", { trigger: "schedule", now: THURSDAY });
  const again = await runRecurringPosts(db, "weekly_program", { trigger: "schedule", now: new Date(THURSDAY.getTime() + 3_600_000) });
  assert.equal(again.created.length, 0);
  assert.match(again.skipped[0].reason, /υπάρχει ήδη/);
  assert.equal(tables.social_content.length, 1);
  assert.equal(uploads.length, 2);
});

test("semi/full autonomy: scheduled directly", async () => {
  const { db, tables } = fakeDb(seed("semi"));
  const r = await runRecurringPosts(db, "weekly_program", { trigger: "schedule", now: THURSDAY });
  assert.equal(r.created[0].status, "scheduled");
  assert.equal(tables.social_content[0].scheduled_for, THURSDAY.toISOString());
  assert.equal(tables.social_approvals?.length ?? 0, 0);
});

test("emergency stop: the Thursday run does nothing", async () => {
  const { db, tables } = fakeDb(seed("full", true));
  const r = await runRecurringPosts(db, "weekly_program", { trigger: "schedule", now: THURSDAY });
  assert.equal(r.status, "stopped");
  assert.equal(tables.social_content.length, 0);
});

test("caption format", () => {
  const c = weeklyCaption("Liga", "Εβδομάδα 23/11 – 29/11", [{ day: "Δευτέρα 23/11", matches: [{ homeName: "A", homeLogo: null, awayName: "B", awayLogo: null, time: "21:00", tag: "PLAYOFF · ΗΜΙΤΕΛ. Α΄" }] }], ["#salonicup"]);
  assert.equal(c, "📅 Το πρόγραμμα της εβδομάδας για το Liga\n23/11 – 29/11\n\n🗓️ Δευτέρα 23/11\n21:00 A – B · PLAYOFF · ΗΜΙΤΕΛ. Α΄\n\nΚαλή επιτυχία σε όλες τις ομάδες! ⚽\n\n#salonicup #liga");
});

// ---------------------------------------------------------------------------
// Monday: standings
// ---------------------------------------------------------------------------
const MONDAY = new Date("2026-11-23T10:00:00Z"); // Δευτέρα 23/11, 12:00 Ελλάδα

function mondaySeed(mode = "manual") {
  const s = seed(mode);
  s.matches.push(
    { ...s.matches[0], match_id: U(20), round: 9, match_date: "2026-11-21T17:00:00Z", match_status: "Played", goals_team_a: 2, goals_team_b: 1 },
    { ...s.matches[0], match_id: U(21), round: 8, match_date: "2026-11-14T17:00:00Z", match_status: "Played" },
    { ...s.matches[0], match_id: U(22), round: 1, stage: "SF", match_date: "2026-11-22T17:00:00Z", match_status: "Played", league_id: U(2) } as never,
  );
  return s;
}

test("Monday standings: one post per league that played, square + story", async () => {
  const { db, tables, uploads } = fakeDb(mondaySeed("manual"));
  const r = await runRecurringPosts(db, "weekly_standings", { trigger: "schedule", now: MONDAY });
  assert.equal(r.week_start, "2026-11-23");
  assert.deepEqual(r.created.map((c) => [c.league, c.status]), [["Master League", "pending_approval"]]);
  // Liga only had a playoff match: its regular-season standings did not change.
  assert.deepEqual(r.skipped.map((s) => [s.league, s.reason]), [["Liga", "δεν έπαιξε αγώνα πρωταθλήματος τις τελευταίες 7 ημέρες"]]);
  const item = tables.social_content[0];
  assert.equal(item.title, "Βαθμολογία · Master League · μετά την 9η αγωνιστική");
  assert.equal(item.source_key, `weekly_standings:${U(1)}:2026-11-23`);
  assert.deepEqual(uploads.map((u) => u.path.split("/").pop()!.split("-").slice(0, 2).join("-")), ["standings-square", "standings-story"]);
  assert.deepEqual(tables.social_assets.map((a) => [a.width, a.height]), [[1080, 1080], [1080, 1920]]);
  assert.match(String(item.caption), /🥇 Spartans · 19 β\.\n🥈 ES Pylaia · 16 β\.\n🥉 Θερμαϊκός · 13 β\./);
  assert.match(String(item.caption), /μετά την 9η αγωνιστική/);
  const again = await runRecurringPosts(db, "weekly_standings", { trigger: "schedule", now: new Date(MONDAY.getTime() + 3_600_000) });
  assert.equal(again.created.length, 0, "no duplicates the same week");
});

test("Monday standings: nothing to post in a week without matches", async () => {
  const { db, tables } = fakeDb(seed("full"));
  const r = await runRecurringPosts(db, "weekly_standings", { trigger: "schedule", now: new Date("2026-12-14T10:00:00Z") });
  assert.equal(r.created.length, 0);
  assert.equal(tables.social_content.length, 0);
});

test("standings caption", () => {
  const rows = [1, 2, 3, 4].map((p) => ({ position: p, name: `T${p}`, logo: null, played: 9, wins: 1, draws: 1, losses: 1, gd: 0, points: 20 - p }));
  assert.equal(standingsCaption("Liga", 9, rows, ["salonicup"]),
    "📊 Η βαθμολογία του Liga μετά την 9η αγωνιστική\n\n🥇 T1 · 19 β.\n🥈 T2 · 18 β.\n🥉 T3 · 17 β.\n\nΌλη η βαθμολογία και τα στατιστικά στο salonicup.gr\n\n#salonicup #liga");
});

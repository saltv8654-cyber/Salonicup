// Agent tool layer: schema generation, input validation, autonomy gating, league data.
// The database is a small in-memory stand-in. (Real RLS is covered by supabase/test/run.sh.)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb, type Rec } from "./fake-db.ts";
import { executeTool, toolDefinitions, TOOLS, type ToolCtx } from "../lib/agent/tools.ts";
import { recentResults } from "../lib/salonicup.ts";

const C1 = "3f1c6a52-8e0b-4d7a-9a51-0c6a1e2b7d10";
const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
function ctx(over: Partial<ToolCtx>, db: SupabaseClient): ToolCtx {
  return {
    db, runId: "run-1", trigger: "chat", userId: "u1", mode: "manual", paused: false, timezone: "Europe/Athens",
    callSpecialist: async (agent, task) => `${agent}:${task.length}`, ...over,
  };
}
const seed = () => ({
  social_content: [{ id: C1, title: "Matchday", platforms: ["instagram"], status: "draft" }],
  social_accounts: [],
});

test("tool definitions are valid for the Messages API", () => {
  const defs = toolDefinitions();
  assert.equal(defs.length, TOOLS.length + 1);
  for (const d of defs) {
    if ("input_schema" in d) {
      assert.equal((d.input_schema as Rec).type, "object", d.name);
      assert.ok(!("$schema" in (d.input_schema as Rec)), d.name);
      assert.ok(d.description && d.description.length > 20, d.name);
    }
  }
  assert.ok(defs.some((d) => d.type === "web_search_20260209"));
  assert.ok(defs.some((d) => "name" in d && d.name === "get_league_data"));
  assert.equal(new Set(defs.map((d) => ("name" in d ? d.name : d.type))).size, defs.length, "unique tool names");
});

test("invalid and unknown tool input is rejected, not executed", async () => {
  const { db, log } = fakeDb(seed());
  const bad = await executeTool(ctx({}, db), "save_memory", { kind: "gossip", content: "x", importance: 9 });
  assert.equal(bad.ok, false);
  assert.equal(bad.output.error, "invalid input");
  assert.equal((await executeTool(ctx({}, db), "drop_tables", {})).ok, false);
  assert.equal(log.length, 0, "no database access for rejected calls");
});

test("manual mode: scheduling creates an approval instead of scheduling", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({ mode: "manual" }, db), "schedule_content", { id: C1, scheduled_for: future });
  assert.equal(r.ok, true, JSON.stringify(r.output));
  assert.equal(r.output.status, "needs_approval");
  assert.match(String(r.output.warning), /No connected account for: instagram/);
  assert.equal(tables.social_content[0].status, "pending_approval");
  assert.equal(tables.social_approvals.length, 1);
});

test("semi mode: scheduling runs directly and is audited", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({ mode: "semi", trigger: "schedule", userId: null }, db), "schedule_content", { id: C1, scheduled_for: future });
  assert.equal(r.output.status, "scheduled");
  assert.equal(tables.social_content[0].status, "scheduled");
  assert.ok(tables.social_activity.some((e) => e.action === "content.scheduled" && e.actor_type === "agent"));
});

test("scheduling in the past is refused", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({ mode: "full" }, db), "schedule_content", { id: C1, scheduled_for: "2020-01-01T10:00:00+02:00" });
  assert.equal(r.output.status, "invalid");
  assert.equal(tables.social_content[0].status, "draft");
});

test("emergency stop blocks autonomous work", async () => {
  const { db, tables } = fakeDb(seed());
  const stopped = ctx({ mode: "full", paused: true, trigger: "schedule", userId: null }, db);
  assert.equal((await executeTool(stopped, "schedule_content", { id: C1, scheduled_for: future })).output.status, "blocked");
  assert.equal((await executeTool(stopped, "save_memory", { kind: "fact", content: "abc", importance: 2 })).output.status, "blocked");
  assert.equal(tables.social_content[0].status, "draft");
  assert.equal(tables.social_memories?.length ?? 0, 0);
});

test("drafts are created as drafts, linked to the run and the match", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({}, db), "create_content_drafts", {
    items: [{ kind: "post", title: "Τελικό σκορ", brief: "b", caption: "c", hashtags: ["#salonicup"], platforms: ["instagram", "facebook"],
      match_id: C1, status: "published" }],
  });
  assert.equal(r.output.status, "created");
  const created = tables.social_content.at(-1)!;
  assert.equal(created.status, "draft", "the model cannot set a status");
  assert.equal(created.run_id, "run-1");
  assert.equal(created.match_id, C1);
});

test("brand changes from an autonomous run need approval", async () => {
  const { db, tables } = fakeDb({ ...seed(), social_settings: [{ id: true, tone: "old" }] });
  const r = await executeTool(ctx({ trigger: "schedule", mode: "full", userId: null }, db), "update_brand_profile", { tone: "new" });
  assert.equal(r.output.status, "needs_approval");
  assert.equal(tables.social_settings[0].tone, "old");
  const r2 = await executeTool(ctx({}, db), "update_brand_profile", { tone: "new" });
  assert.equal(r2.output.status, "updated");
  assert.equal(tables.social_settings[0].tone, "new");
});

test("delegation reaches the specialist", async () => {
  const { db } = fakeDb(seed());
  const r = await executeTool(ctx({}, db), "delegate_to_specialist", { agent: "strategy", task: "Plan December for the league" });
  assert.equal(r.output.output, "strategy:28");
});

test("league results: scores, scorers, own goals credited to the other team, MVP", async () => {
  const A = "team-a", B = "team-b";
  const { db } = fakeDb({
    matches: [{ match_id: "m1", league_id: "l1", round: 5, stage: null, match_date: "2026-11-15T18:00:00Z", venue_id: "v1",
      team_a: A, team_b: B, goals_team_a: 2, goals_team_b: 1, pens_team_a: 0, pens_team_b: 0, match_status: "Played",
      mvp_player_id: "p1", report: "Ένα ματς με ένταση.", stream_url: "https://youtu.be/x" }],
    teams: [{ team_id: A, name: "Spartans" }, { team_id: B, name: "ES Pylaia" }],
    leagues: [{ league_id: "l1", name: "Master League" }],
    venues: [{ venue_id: "v1", name: "Νικοκούδη" }],
    events: [
      { match_id: "m1", team_id: A, player_id: "p1", event_type: "GOAL", period: "H1", minute: 12 },
      { match_id: "m1", team_id: B, player_id: "p2", event_type: "GOAL", period: "H2", minute: 5 },
      { match_id: "m1", team_id: B, player_id: "p3", event_type: "OWN", period: "H2", minute: 20 },
    ],
    players: [{ player_id: "p1", full_name: "Γιάννης" }, { player_id: "p2", full_name: "Νίκος" }, { player_id: "p3", full_name: "Κώστας" }],
  });
  const [r] = await recentResults(db, 7);
  assert.equal(r.home, "Spartans");
  assert.equal(r.away, "ES Pylaia");
  assert.equal(r.score, "2-1");
  // H2 minutes are stored relative to the half: 5 → 35', 20 → 50'
  assert.deepEqual(r.home_scorers, ["Γιάννης 12'", "Κώστας 50' (αυτογκόλ)"]);
  assert.deepEqual(r.away_scorers, ["Νίκος 35'"]);
  assert.equal(r.mvp, "Γιάννης");
  assert.equal(r.league, "Master League");
});

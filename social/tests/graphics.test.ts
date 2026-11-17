// Renders every template in every format from realistic league data and checks the PNGs.
// Images are also written to $GRAPHICS_OUT (if set) so a person can look at them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fakeDb } from "./fake-db.ts";
import { renderGraphic, GraphicError } from "../lib/graphics/render.tsx";
import { FORMATS, TEMPLATES, themeFrom, type FormatId, type TemplateId } from "../lib/graphics/theme.ts";
import { executeTool, type ToolCtx } from "../lib/agent/tools.ts";

const now = Date.now();
const iso = (h: number) => new Date(now + h * 3_600_000).toISOString();
const LOGO = "https://example.supabase.co/storage/v1/object/public/logos/spartans.png";

function seed() {
  const teams = ["Spartans", "ES Pylaia", "Θερμαϊκός United", "Real Kalamaria", "Αετοί Τούμπας", "FC Ladadika"].map((name, i) =>
    ({ team_id: `t${i}`, name, logo_url: i === 0 ? LOGO : null }));
  const m = (id: string, a: number, b: number, status: string, h: number, ga = 0, gb = 0, extra = {}) => ({
    match_id: id, league_id: "l1", round: 9, stage: null, match_date: iso(h), venue_id: "v1", field: "Γήπ. 3",
    team_a: `t${a}`, team_b: `t${b}`, goals_team_a: ga, goals_team_b: gb, pens_team_a: 0, pens_team_b: 0,
    match_status: status, mvp_player_id: null, report: null, stream_url: null, ...extra,
  });
  return {
    leagues: [{ league_id: "l1", name: "Master League", season: "2026-27", logo_url: null, active: true }],
    venues: [{ venue_id: "v1", name: "Νικοκούδη" }],
    teams,
    matches: [
      m("played", 0, 1, "Played", -20, 3, 2, { mvp_player_id: "p1", stream_url: "https://youtu.be/x" }),
      m("played2", 2, 3, "Played", -26, 1, 1),
      m("next", 4, 5, "Scheduled", 30, 0, 0, { stream_url: "https://youtu.be/y" }),
      m("next2", 0, 2, "Scheduled", 54),
    ],
    events: [
      { match_id: "played", team_id: "t0", player_id: "p1", event_type: "GOAL", period: "H1", minute: 7 },
      { match_id: "played", team_id: "t0", player_id: "p1", event_type: "GOAL", period: "H2", minute: 18 },
      { match_id: "played", team_id: "t1", player_id: "p2", event_type: "GOAL", period: "H2", minute: 22 },
      { match_id: "played", team_id: "t1", player_id: "p3", event_type: "OWN", period: "H2", minute: 28 },
      { match_id: "played", team_id: "t1", player_id: "p4", event_type: "GOAL", period: "H2", minute: 30 },
    ],
    players: [
      { player_id: "p1", full_name: "Γιάννης Παπαδόπουλος", photo_url: null, team_id: "t0" },
      { player_id: "p2", full_name: "Νίκος Κ.", photo_url: null, team_id: "t1" },
      { player_id: "p3", full_name: "Κώστας Αυτογκολίδης", photo_url: null, team_id: "t1" },
      { player_id: "p4", full_name: "Μιχάλης", photo_url: null, team_id: "t1" },
    ],
    standings: teams.map((t, i) => ({ league_id: "l1", position: i + 1, team_name: t.name, logo_url: t.logo_url, played: 9,
      wins: 6 - i, draws: i % 3, losses: i, goals_for: 25 - 2 * i, goals_against: 8 + i, goal_diff: 17 - 3 * i, points: 20 - 3 * i })),
    player_stats: [
      { league_id: "l1", full_name: "Γιάννης Παπαδόπουλος", team_name: "Spartans", photo_url: null, goals: 14, assists: 3, mvp_awards: 2, appearances: 9 },
      { league_id: "l1", full_name: "Νίκος Κ.", team_name: "ES Pylaia", photo_url: null, goals: 9, assists: 5, mvp_awards: 1, appearances: 9 },
    ],
  };
}

const settings = { brand_name: "Salonicup", colors: [], website: "https://salonicup.gr", hashtags: ["salonicup"], timezone: "Europe/Athens" };
const SPEC: Record<TemplateId, { match_id?: string; days?: number }> = {
  final_score: { match_id: "played" }, matchday: { match_id: "next" }, mvp: { match_id: "played" },
  fixtures: { days: 7 }, results: { days: 7 }, standings: {}, top_scorers: {},
};

let crestPng: Buffer;
const fetcher = (async (url: string) => {
  crestPng ??= await readFile(path.join(process.cwd(), "public/logo.png"));
  return url === LOGO ? new Response(new Uint8Array(crestPng), { headers: { "content-type": "image/png" } }) : new Response("no", { status: 404 });
}) as typeof fetch;

const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

for (const template of Object.keys(TEMPLATES) as TemplateId[]) {
  test(`renders ${template} in every format`, async () => {
    const { db } = fakeDb(seed());
    for (const format of Object.keys(FORMATS) as FormatId[]) {
      const r = await renderGraphic(db, { template, format, ...SPEC[template] }, settings, fetcher);
      assert.equal(r.png.subarray(1, 4).toString(), "PNG", `${template}/${format} is a PNG`);
      assert.deepEqual(pngSize(r.png), { w: FORMATS[format].width, h: FORMATS[format].height });
      assert.ok(r.png.length > 15_000, `${template}/${format} has content (${r.png.length} bytes)`);
      if (process.env.GRAPHICS_OUT) {
        await mkdir(process.env.GRAPHICS_OUT, { recursive: true });
        await writeFile(path.join(process.env.GRAPHICS_OUT, `${template}-${format}.png`), r.png);
      }
    }
  });
}

test("refuses graphics the data does not support", async () => {
  const { db } = fakeDb(seed());
  await assert.rejects(renderGraphic(db, { template: "final_score", format: "post", match_id: "next" }, settings, fetcher), GraphicError);
  await assert.rejects(renderGraphic(db, { template: "matchday", format: "post", match_id: "played" }, settings, fetcher), GraphicError);
  await assert.rejects(renderGraphic(db, { template: "mvp", format: "post", match_id: "played2" }, settings, fetcher), /MVP/);
  await assert.rejects(renderGraphic(db, { template: "final_score", format: "post", match_id: "missing" }, settings, fetcher), /δεν βρέθηκε/);
});

test("brand colors from settings drive the theme", () => {
  const t = themeFrom({ colors: [{ name: "Κύριο", hex: "#0b3d91" }, { name: "Φόντο", hex: "#ffffff" }] });
  assert.equal(t.primary, "#0b3d91");
  assert.equal(t.bg, "#ffffff");
  assert.equal(themeFrom({}).primary, "#E05B1F");
});

test("agent tool: create_graphic stores the PNG and attaches it to the draft", async () => {
  const data = seed();
  data.teams.forEach((t) => (t.logo_url = null)); // no network in this test
  const DRAFT = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const { db, tables, uploads } = fakeDb({
    ...data,
    social_settings: [{ id: true, ...settings }],
    social_content: [{ id: DRAFT, title: "Final Score", status: "draft", asset_ids: [] }],
  });
  const ctx: ToolCtx = { db, runId: "run-1", trigger: "chat", userId: "u1", mode: "manual", paused: false, timezone: "Europe/Athens",
    callSpecialist: async () => "" };
  // ids in the seed are not UUIDs, so give the played match one
  const MATCH = "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";
  tables.matches.find((m) => m.match_id === "played")!.match_id = MATCH;
  tables.events.forEach((e) => e.match_id === "played" && (e.match_id = MATCH));

  const r = await executeTool(ctx, "create_graphic", { template: "final_score", format: "post", match_id: MATCH, content_id: DRAFT });
  assert.equal(r.ok, true, JSON.stringify(r.output));
  assert.equal(r.output.status, "created");
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, "social-assets");
  assert.equal(uploads[0].contentType, "image/png");
  assert.match(uploads[0].path, /^generated\/\d{4}-\d{2}\/final_score-post-/);
  const asset = tables.social_assets[0];
  assert.equal(asset.source, "generated");
  assert.equal(asset.match_id, MATCH);
  assert.deepEqual(tables.social_content[0].asset_ids, [asset.id]);

  const next = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
  tables.matches.find((m) => m.match_id === "next")!.match_id = next;
  const u = await executeTool(ctx, "create_graphic", { template: "final_score", format: "post", match_id: next });
  assert.equal(u.output.status, "unavailable");
  assert.match(String(u.output.reason), /δεν έχει ολοκληρωθεί/);
  assert.equal(uploads.length, 1, "nothing stored for an unavailable graphic");
});

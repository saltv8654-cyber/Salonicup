// Agent tool layer: schema generation, input validation, autonomy gating and tenant scoping.
// The database is a small in-memory stand-in that records every filter, so we can assert that
// each query is scoped to the run's business. (Real RLS is covered by supabase/test/run.sh.)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, toolDefinitions, TOOLS, type ToolCtx } from "../lib/agent/tools.ts";

type Rec = Record<string, any>;
function fakeDb(seed: Record<string, Rec[]>) {
  const tables: Record<string, Rec[]> = structuredClone(seed);
  const log: { table: string; op: string; filters: [string, unknown][]; values?: unknown }[] = [];
  const db = {
    from(table: string) {
      tables[table] ??= [];
      const entry = { table, op: "select", filters: [] as [string, unknown][], values: undefined as unknown };
      log.push(entry);
      const match = (r: Rec) => entry.filters.every(([k, v]) => r[k] === v);
      const result = () => {
        if (entry.op === "insert") {
          const rows = (Array.isArray(entry.values) ? entry.values : [entry.values]).map((v: any, i: number) => ({ id: `new-${table}-${tables[table].length + i}`, ...v }));
          tables[table].push(...rows);
          return rows;
        }
        const rows = tables[table].filter(match);
        if (entry.op === "update") rows.forEach((r) => Object.assign(r, entry.values));
        return rows;
      };
      const q: any = {
        select: () => q,
        insert: (v: unknown) => { entry.op = "insert"; entry.values = v; return q; },
        update: (v: unknown) => { entry.op = "update"; entry.values = v; return q; },
        eq: (k: string, v: unknown) => { entry.filters.push([k, v]); return q; },
        in: () => q, gte: () => q, lte: () => q, lt: () => q, is: () => q, or: () => q, order: () => q, limit: () => q,
        single: async () => { const r = result(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: "0 rows" } }; },
        maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
        then: (res: (v: unknown) => void) => res({ data: result(), error: null }),
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, tables, log };
}

const BIZ = "biz-1";
const C1 = "3f1c6a52-8e0b-4d7a-9a51-0c6a1e2b7d10";
const C_OTHER = "7b2e9f04-1c3d-4e5f-8a6b-9c0d1e2f3a4b";
const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
function ctx(over: Partial<ToolCtx>, db: SupabaseClient): ToolCtx {
  return {
    db, businessId: BIZ, orgId: "org-1", runId: "run-1", trigger: "chat", userId: "u1", userRole: "editor",
    mode: "manual", paused: false, orgEnabled: true, timezone: "Europe/Athens",
    callSpecialist: async (agent, task) => `${agent}:${task.length}`, ...over,
  };
}
const seed = () => ({
  content_items: [
    { id: C1, business_id: BIZ, title: "Matchday", platforms: ["instagram"], status: "draft" },
    { id: C_OTHER, business_id: "biz-2", title: "Not yours", platforms: ["instagram"], status: "draft" },
  ],
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
  assert.equal(new Set(defs.map((d) => d.name)).size, defs.length, "unique tool names");
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
  assert.equal(tables.content_items[0].status, "pending_approval");
  assert.equal(tables.approvals.length, 1);
  assert.equal(tables.approvals[0].business_id, BIZ);
});

test("semi mode: scheduling runs directly and is audited", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({ mode: "semi", trigger: "schedule", userRole: null }, db), "schedule_content", { id: C1, scheduled_for: future });
  assert.equal(r.output.status, "scheduled");
  assert.equal(tables.content_items[0].status, "scheduled");
  assert.ok(tables.activity_log.some((e) => e.action === "content.scheduled" && e.actor_type === "agent"));
});

test("emergency stop blocks autonomous scheduling", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({ mode: "full", paused: true, trigger: "schedule", userRole: null }, db), "schedule_content", { id: C1, scheduled_for: future });
  assert.equal(r.output.status, "blocked");
  assert.equal(tables.content_items[0].status, "draft");
});

test("a content id from another business is never touched", async () => {
  const { db, tables, log } = fakeDb(seed());
  const r = await executeTool(ctx({ mode: "full" }, db), "schedule_content", { id: C_OTHER, scheduled_for: future });
  assert.equal(r.ok, false);
  assert.equal(tables.content_items[1].status, "draft");
  for (const q of log.filter((x) => x.table === "content_items"))
    assert.ok(q.filters.some(([k, v]) => k === "business_id" && v === BIZ), "every content query is scoped to the business");
});

test("drafts are written with the run's business id, whatever the model sends", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({}, db), "create_content_drafts", {
    items: [{ kind: "post", title: "Τελικό σκορ", brief: "b", caption: "c", hashtags: ["#salonicup"], platforms: ["instagram", "facebook"], business_id: "biz-2" }],
  });
  assert.equal(r.output.status, "created");
  const created = tables.content_items.at(-1)!;
  assert.equal(created.business_id, BIZ);
  assert.equal(created.status, "draft");
  assert.equal(created.run_id, "run-1");
});

test("viewers cannot make the agent write", async () => {
  const { db, tables } = fakeDb(seed());
  const r = await executeTool(ctx({ userRole: "viewer" }, db), "create_campaign", {
    name: "Χειμώνας", objective: "y", starts_on: "2026-12-01", ends_on: "2026-12-31", strategy: "z",
  });
  assert.equal(r.output.status, "blocked");
  assert.equal(tables.campaigns?.length ?? 0, 0);
});

test("delegation reaches the specialist", async () => {
  const { db } = fakeDb(seed());
  const r = await executeTool(ctx({}, db), "delegate_to_specialist", { agent: "strategy", task: "Plan December for the league" });
  assert.equal(r.output.output, "strategy:28");
});

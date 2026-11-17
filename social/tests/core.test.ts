import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decide, budgetBlockReason, type PolicyInput } from "../lib/policy.ts";
import { retryDelayMs, isRetryable } from "../lib/backoff.ts";
import { nextRun, zonedToUtc } from "../lib/schedule.ts";
import { encryptSecret, decryptSecret } from "../lib/crypto.ts";
import { INTEGRATIONS, integrationState, missingEnv } from "../lib/integrations.ts";

const base: PolicyInput = { action: "schedule_post", mode: "manual", paused: false, trigger: "chat" };
const alone = { trigger: "schedule" as const };

test("manual mode: every external action waits for approval", () => {
  for (const action of ["schedule_post", "publish_post", "reply_comment"] as const)
    assert.equal(decide({ ...base, action }), "needs_approval");
  assert.equal(decide({ ...base, action: "create_draft" }), "allow");
});

test("semi mode: schedules and replies run, publishing waits", () => {
  const semi = { ...base, ...alone, mode: "semi" as const };
  assert.equal(decide({ ...semi, action: "schedule_post" }), "allow");
  assert.equal(decide({ ...semi, action: "reply_comment" }), "allow");
  assert.equal(decide({ ...semi, action: "publish_post" }), "needs_approval");
});

test("full mode still asks for sensitive actions", () => {
  const full = { ...base, ...alone, mode: "full" as const };
  assert.equal(decide({ ...full, action: "publish_post" }), "allow");
  assert.equal(decide({ ...full, action: "reply_sensitive" }), "needs_approval");
  assert.equal(decide({ ...full, action: "delete_content" }), "needs_approval");
  assert.equal(decide({ ...full, action: "update_brand" }), "needs_approval");
  assert.equal(decide({ ...base, mode: "full", action: "update_brand" }), "allow"); // asked in chat
});

test("emergency stop", () => {
  const stopped = { ...base, ...alone, mode: "full" as const, paused: true };
  assert.equal(decide({ ...stopped, action: "publish_post" }), "blocked");
  assert.equal(decide({ ...stopped, action: "create_draft" }), "blocked");
  // An admin in chat can still work; anything external waits for approval.
  assert.equal(decide({ ...base, mode: "full", paused: true, action: "create_draft" }), "allow");
  assert.equal(decide({ ...base, mode: "full", paused: true, action: "publish_post" }), "needs_approval");
});

test("monthly cost cap", () => {
  assert.equal(budgetBlockReason(10, 50), null);
  assert.match(budgetBlockReason(50, 50)!, /όριο/);
});

test("backoff grows and caps", () => {
  const noJitter = () => 0;
  assert.equal(retryDelayMs(1, noJitter), 30_000);
  assert.equal(retryDelayMs(2, noJitter), 60_000);
  assert.equal(retryDelayMs(20, noJitter), 3_600_000);
  assert.ok(retryDelayMs(1, () => 1) <= 36_000);
  assert.ok(isRetryable({ status: 429 }));
  assert.ok(isRetryable({ status: 503 }));
  assert.ok(!isRetryable({ status: 400 }));
  assert.ok(isRetryable(new Error("fetch failed")));
  assert.ok(!isRetryable(new Error("invalid input")));
});

test("timezone conversion across DST (Europe/Athens)", () => {
  assert.equal(zonedToUtc(2026, 1, 15, 8, "Europe/Athens").toISOString(), "2026-01-15T06:00:00.000Z"); // UTC+2
  assert.equal(zonedToUtc(2026, 7, 15, 8, "Europe/Athens").toISOString(), "2026-07-15T05:00:00.000Z"); // UTC+3
});

test("next run: daily, weekly, monthly", () => {
  const tz = "Europe/Athens";
  const after = new Date("2026-11-16T07:00:00Z"); // Mon 09:00 Athens
  assert.equal(nextRun({ workflow: "daily_check", hour_local: 8, weekday: null, monthday: null }, tz, after).toISOString(),
    "2026-11-17T06:00:00.000Z");
  assert.equal(nextRun({ workflow: "daily_check", hour_local: 10, weekday: null, monthday: null }, tz, after).toISOString(),
    "2026-11-16T08:00:00.000Z");
  assert.equal(nextRun({ workflow: "weekly_strategy", hour_local: 9, weekday: 1, monthday: null }, tz, after).toISOString(),
    "2026-11-23T07:00:00.000Z"); // 09:00 today already passed → next Monday
  assert.equal(nextRun({ workflow: "monthly_report", hour_local: 10, weekday: null, monthday: 1 }, tz, after).toISOString(),
    "2026-12-01T08:00:00.000Z");
});

test("token encryption round-trip and tamper detection", () => {
  const key = randomBytes(32).toString("base64");
  const enc = encryptSecret("EAAG-secret-token", key);
  assert.doesNotMatch(enc, /secret-token/);
  assert.equal(decryptSecret(enc, key), "EAAG-secret-token");
  const parts = enc.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptSecret(parts.join("."), key));
  assert.throws(() => decryptSecret(enc, randomBytes(32).toString("base64")));
});

test("integration status is derived from real configuration", () => {
  const anthropic = INTEGRATIONS.find((i) => i.id === "anthropic")!;
  assert.equal(integrationState(anthropic, {}), "needs_credentials");
  assert.deepEqual(missingEnv(anthropic, {}), ["ANTHROPIC_API_KEY"]);
  assert.equal(integrationState(anthropic, { ANTHROPIC_API_KEY: "x" }), "active");
  // Not-yet-built integrations never show as active, even with keys present.
  const ig = INTEGRATIONS.find((i) => i.id === "meta_instagram")!;
  assert.equal(integrationState(ig, { META_APP_ID: "1", META_APP_SECRET: "2" }), "planned");
});

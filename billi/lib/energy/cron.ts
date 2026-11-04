import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dbConfigured } from "../db";
import { isMissingMigration } from "./http";
import { runDueSources } from "./run";

// Opened straight in a browser too, so say it is UTF-8 or Safari garbles the Greek.
const out = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "content-type": "application/json; charset=utf-8" } });

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.nextUrl.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function cronResponse(req: NextRequest) {
  if (!authorised(req)) return out({ error: "unauthorized" }, 401);
  if (!dbConfigured()) return out({ error: "Δεν έχει συνδεθεί το Supabase" }, 500);
  if (!process.env.ANTHROPIC_API_KEY) return out({ error: "Λείπει το ANTHROPIC_API_KEY" }, 500);
  try {
    const { results, remaining } = await runDueSources(240_000, "cron");
    return out({
      checked: results.length,
      remaining,
      queued: results.reduce((n, r) => n + r.queued, 0),
      results: results.map((r) => ({ source: r.label, status: r.status, message: r.message, found: r.found, queued: r.queued })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return out({ error: isMissingMigration(msg) ? "Τρέξε πρώτα το SQL της διαχείρισης ενέργειας στο Supabase" : msg }, 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FUNNEL = ["page_view", "upload_start", "analysis_ok", "tariff_click", "lead_open", "lead_submit"] as const;

function hostOf(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Funnel (unique sessions per step) and traffic sources for the last N days. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await db()
    .from("events")
    .select("name, session_id, source, props")
    .gte("created_at", since)
    .limit(50_000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessionsBy = new Map<string, Set<string>>();
  const sources = new Map<string, Set<string>>();
  const tariffClicks = new Map<string, number>();
  for (const e of data ?? []) {
    const sid = e.session_id ?? "anon";
    if (!sessionsBy.has(e.name)) sessionsBy.set(e.name, new Set());
    sessionsBy.get(e.name)!.add(sid);
    if (e.name === "page_view") {
      const s = (e.source as Record<string, string> | null) ?? {};
      const key = s.utm_source || hostOf(s.referrer) || "Απευθείας";
      if (!sources.has(key)) sources.set(key, new Set());
      sources.get(key)!.add(sid);
    }
    if (e.name === "tariff_click") {
      const label = String((e.props as Record<string, unknown> | null)?.tariff ?? "—");
      tariffClicks.set(label, (tariffClicks.get(label) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    days,
    funnel: FUNNEL.map((name) => ({ name, sessions: sessionsBy.get(name)?.size ?? 0 })),
    sources: [...sources.entries()].map(([source, s]) => ({ source, sessions: s.size })).sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    tariffClicks: [...tariffClicks.entries()].map(([tariff, clicks]) => ({ tariff, clicks })).sort((a, b) => b.clicks - a.clicks).slice(0, 15),
  });
}

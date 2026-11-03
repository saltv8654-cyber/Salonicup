import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { dbConfigured } from "@/lib/db";
import { loadPeriod, matches, summarise, type FilterType } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: FilterType[] = ["step", "source", "campaign", "device", "os", "browser", "country", "city", "provider", "color", "recommended", "tariff", "channel", "hour", "weekday", "error", "date", "lead"];

/** Visitors behind a number on the stats page: ?days=30&type=source&value=facebook */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const q = req.nextUrl.searchParams;
  const days = Math.min(365, Math.max(1, Number(q.get("days")) || 30));
  const type = q.get("type") as FilterType | null;
  const value = q.get("value") ?? "";
  try {
    const { events, leads } = await loadPeriod(days);
    const all = [...summarise(events, leads).values()].filter((s) => s.sid !== "anon");
    const sessions = type && TYPES.includes(type) ? all.filter((s) => matches(s, type, value)) : all;
    sessions.sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
    return NextResponse.json({ total: sessions.length, sessions: sessions.slice(0, 300) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

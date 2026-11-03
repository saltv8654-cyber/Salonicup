import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { dbConfigured } from "@/lib/db";
import { buildStats, loadPeriod, summarise } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const periodOf = (req: NextRequest) => Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));

/** KPIs, daily series, funnel and breakdowns, all counted in unique visitors. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  try {
    const days = periodOf(req);
    const { events, leads } = await loadPeriod(days);
    return NextResponse.json(buildStats(summarise(events, leads), leads, days));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

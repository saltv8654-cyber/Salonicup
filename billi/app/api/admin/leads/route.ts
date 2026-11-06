import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { loadCrmLeads } from "@/lib/crm-data";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Leads with their CRM signals: score, stalled flag, last visit and open tasks. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  try {
    const { leads, tasks, tasksOk } = await loadCrmLeads();
    return NextResponse.json({ leads: leads.map(({ profile, ...l }) => l), tasks, tasks_ready: tasksOk });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

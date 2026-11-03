import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full journey of one visitor, plus the lead they became (if any). */
export async function GET(req: NextRequest, { params }: { params: { sid: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const [ev, lead] = await Promise.all([
    db().from("events").select("created_at, name, path, props, source").eq("session_id", params.sid).order("created_at", { ascending: true }).limit(500),
    db().from("leads").select("id, name, status, phone").eq("session_id", params.sid).order("created_at", { ascending: false }).limit(1),
  ]);
  if (ev.error) return NextResponse.json({ error: ev.error.message }, { status: 500 });
  return NextResponse.json({ events: ev.data ?? [], lead: lead.data?.[0] ?? null });
}

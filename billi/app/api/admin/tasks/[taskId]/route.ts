import { NextRequest, NextResponse } from "next/server";
import { adminName } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";

/** { done: true | false } */
export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const patch = body.done ? { done_at: new Date().toISOString(), done_by: admin } : { done_at: null, done_by: null };
  const { data, error } = await db().from("lead_tasks").update(patch).eq("id", params.taskId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.done) await db().from("lead_activities").insert({ lead_id: (data as { lead_id: string }).lead_id, type: "note", body: `✅ Ολοκληρώθηκε: ${(data as { title: string }).title} · ${admin}` });
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { taskId: string } }) {
  if (!adminName(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const { error } = await db().from("lead_tasks").delete().eq("id", params.taskId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

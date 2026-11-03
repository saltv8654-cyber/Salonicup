import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";
import { billFileOf, billUrl, removeBill } from "@/lib/bill-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function leadBill(id: string) {
  const { data, error } = await db().from("leads").select("id, bill").eq("id", id).single();
  if (error || !data) return null;
  return { lead: data, file: billFileOf(data.bill) };
}

/** 5-minute link to view the attached bill. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const found = await leadBill(params.id);
  if (!found?.file) return NextResponse.json({ error: "Δεν υπάρχει αρχείο" }, { status: 404 });
  try {
    return NextResponse.json({ url: await billUrl(found.file.path), file: found.file });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const found = await leadBill(params.id);
  if (!found?.file) return NextResponse.json({ ok: true });
  try {
    await removeBill(found.file.path);
    const { _file, ...rest } = (found.lead.bill ?? {}) as Record<string, unknown>;
    await db().from("leads").update({ bill: rest }).eq("id", params.id);
    await db().from("lead_activities").insert({ lead_id: params.id, type: "system", body: "🗑 Διαγράφηκε το αρχείο του λογαριασμού" });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

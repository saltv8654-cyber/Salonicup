import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured, LEAD_STATUSES } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "Νέο", contacted: "Επικοινωνία", offer: "Προσφορά", signed: "Υπογραφή", active: "Ενεργό", lost: "Χάθηκε",
};

const Patch = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  signed_provider: z.string().trim().max(100).nullable().optional(),
  expected_commission: z.number().finite().nonnegative().nullable().optional(),
  next_follow_up: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Lead with its full contact history. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const [lead, acts] = await Promise.all([
    db().from("leads").select("*").eq("id", params.id).single(),
    db().from("lead_activities").select("*").eq("lead_id", params.id).order("created_at", { ascending: false }),
  ]);
  if (lead.error) return NextResponse.json({ error: lead.error.message }, { status: 404 });
  return NextResponse.json({ lead: lead.data, activities: acts.data ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρα στοιχεία" }, { status: 400 });

  const before = await db().from("leads").select("status").eq("id", params.id).single();
  if (before.error) return NextResponse.json({ error: before.error.message }, { status: 404 });

  const { data, error } = await db()
    .from("leads")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Status changes go into the contact history automatically.
  if (parsed.data.status && parsed.data.status !== before.data.status) {
    await db().from("lead_activities").insert({
      lead_id: params.id,
      type: "status",
      body: `${STATUS_LABEL[before.data.status] ?? before.data.status} → ${STATUS_LABEL[parsed.data.status]}`,
    });
  }
  return NextResponse.json({ lead: data });
}

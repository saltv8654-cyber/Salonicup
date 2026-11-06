import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminName, isAdmin } from "@/lib/admin-auth";
import { recordConsent } from "@/lib/marketing";
import { db, dbConfigured, LEAD_STATUSES } from "@/lib/db";
import { billFileOf, removeBill } from "@/lib/bill-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "Νέο αίτημα", contacted: "Επικοινωνία", evaluation: "Υπό αξιολόγηση", offer: "Προσφορά", signed: "Υπογραφή", active: "Ολοκληρώθηκε", lost: "Απορρίφθηκε",
};

const Patch = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  signed_provider: z.string().trim().max(100).nullable().optional(),
  expected_commission: z.number().finite().nonnegative().nullable().optional(),
  next_follow_up: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  consent_marketing: z.boolean().optional(),
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

  const before = await db().from("leads").select("status, bill").eq("id", params.id).single();
  if (before.error) return NextResponse.json({ error: before.error.message }, { status: 404 });

  const { data, error } = await db()
    .from("leads")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (parsed.data.consent_marketing !== undefined) {
    // Only on the customer's request (e.g. by phone): recorded with who changed it.
    await recordConsent({ lead_id: params.id, purpose: "marketing", granted: parsed.data.consent_marketing, source: "admin", actor: adminName(req) });
    await db().from("lead_activities").insert({ lead_id: params.id, type: "system", body: parsed.data.consent_marketing ? "✅ Συγκατάθεση για προσφορές (κατόπιν αιτήματος του πελάτη)" : "🚫 Ανάκληση συγκατάθεσης για προσφορές" });
  }

  // Once the deal is done or lost the bill isn't needed any more: delete it (data minimisation).
  const file = billFileOf(before.data.bill);
  if (file && parsed.data.status && ["active", "lost"].includes(parsed.data.status)) {
    try {
      await removeBill(file.path);
      const { _file, ...rest } = (before.data.bill ?? {}) as Record<string, unknown>;
      await db().from("leads").update({ bill: rest }).eq("id", params.id);
      data.bill = rest;
      await db().from("lead_activities").insert({ lead_id: params.id, type: "system", body: "🗑 Το αρχείο του λογαριασμού διαγράφηκε αυτόματα" });
    } catch (e) {
      console.error("auto-delete bill failed:", e);
    }
  }

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

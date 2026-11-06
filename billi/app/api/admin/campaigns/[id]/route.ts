import { NextRequest, NextResponse } from "next/server";
import { adminName } from "@/lib/admin-auth";
import { intlPhone } from "@/lib/crm";
import { db, dbConfigured, type Lead } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recipients of a campaign with their personalised Viber / WhatsApp links. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!adminName(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const { data: camp } = await db().from("campaigns").select("*").eq("id", params.id).maybeSingle();
  if (!camp) return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
  const { data: rs } = await db().from("campaign_recipients").select("*, leads(name, phone, email, status)").eq("campaign_id", params.id);
  const recipients = ((rs ?? []) as (Record<string, unknown> & { leads: Pick<Lead, "name" | "phone" | "email" | "status"> | null; message: string })[]).map((r) => {
    const phone = r.leads ? intlPhone(r.leads.phone) : "";
    return {
      ...r,
      viber: `viber://chat?number=${encodeURIComponent(phone)}&draft=${encodeURIComponent(r.message)}`,
      whatsapp: `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(r.message)}`,
    };
  });
  return NextResponse.json({ campaign: camp, recipients });
}

/** Mark a Viber / WhatsApp message as sent (or skipped) after sending it from the phone. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.lead_id !== "string" || !["sent", "skipped", "pending"].includes(body.status)) return NextResponse.json({ error: "Μη έγκυρα στοιχεία" }, { status: 400 });
  const { data: camp } = await db().from("campaigns").select("name, channel").eq("id", params.id).maybeSingle();
  const { error } = await db().from("campaign_recipients").update({ status: body.status, sent_at: body.status === "sent" ? new Date().toISOString() : null }).eq("campaign_id", params.id).eq("lead_id", body.lead_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.status === "sent" && camp) await db().from("lead_activities").insert({ lead_id: body.lead_id, type: "note", body: `📣 Καμπάνια «${camp.name}» (${camp.channel}) · ${admin}` });
  return NextResponse.json({ ok: true });
}

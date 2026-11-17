import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/access";
import { serviceClient, supabaseConfigured } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { BrandPatch } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";
const Body = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(2000).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Μη έγκυρο αίτημα" }, { status: 400 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "Το Supabase δεν είναι ρυθμισμένο στον server" }, { status: 503 });
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Μόνο για admins" }, { status: 403 });

  const db = serviceClient();
  const { decision, note } = parsed.data;
  // Only a pending approval can be decided, exactly once.
  const { data: rows } = await db.from("social_approvals")
    .update({ status: decision, decided_by: admin.userId, decided_at: new Date().toISOString(), note: note?.trim() || null })
    .eq("id", params.id).eq("status", "pending").select("*");
  const approval = rows?.[0];
  if (!approval) return NextResponse.json({ error: "Δεν βρέθηκε ή έχει ήδη αποφασιστεί" }, { status: 409 });

  if (approval.action === "schedule_post" && approval.target_id) {
    await db.from("social_content").update(decision === "approved"
      ? { status: "scheduled", scheduled_for: approval.payload.scheduled_for }
      : { status: "rejected", scheduled_for: null }).eq("id", approval.target_id);
  }
  if (approval.action === "update_brand" && decision === "approved") {
    const patch = BrandPatch.safeParse(approval.payload);
    if (patch.success) await db.from("social_settings").update({ ...patch.data, updated_at: new Date().toISOString() }).eq("id", true);
  }
  // The agent learns from every rejection that carries a reason.
  if (decision === "rejected" && note?.trim()) {
    await db.from("social_memories").insert({
      kind: "preference", importance: 4, source: "user", content: `Απορρίφθηκε: «${approval.summary}». Λόγος: ${note.trim()}`,
    });
  }
  await logActivity({ actorType: "user", actorId: admin.userId, action: `approval.${decision}`, targetType: "approval", targetId: approval.id,
    details: { action: approval.action, note } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessAccess } from "@/lib/access";
import { hasRole } from "@/lib/policy";
import { userClient, serviceClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
const Body = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(2000).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρο αίτημα" }, { status: 400 });

  // RLS: the approval is visible only to members of its business.
  const { data: approval } = await userClient().from("approvals").select("*").eq("id", params.id).maybeSingle();
  if (!approval) return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
  const access = await getBusinessAccess(approval.business_id);
  if (!access || !hasRole(access.role, "editor")) return NextResponse.json({ error: "Χωρίς δικαίωμα" }, { status: 403 });

  const db = serviceClient();
  const { decision, note } = parsed.data;
  // Only a pending approval can be decided, exactly once.
  const { data: updated } = await db.from("approvals")
    .update({ status: decision, decided_by: access.userId, decided_at: new Date().toISOString(), note: note ?? null })
    .eq("id", approval.id).eq("status", "pending").select("id");
  if (!updated?.length) return NextResponse.json({ error: "Έχει ήδη αποφασιστεί" }, { status: 409 });

  const b = approval.business_id as string;
  if (approval.action === "schedule_post" && approval.target_id) {
    await db.from("content_items").update(decision === "approved"
      ? { status: "scheduled", scheduled_for: approval.payload.scheduled_for }
      : { status: "rejected", scheduled_for: null })
      .eq("id", approval.target_id).eq("business_id", b);
  }
  if (approval.action === "update_brand" && decision === "approved") {
    const { description, industry, website, ...brand } = approval.payload ?? {};
    if (Object.keys(brand).length) await db.from("brand_profiles").update(brand).eq("business_id", b);
    const biz = Object.fromEntries(Object.entries({ description, industry, website }).filter(([, v]) => v !== undefined));
    if (Object.keys(biz).length) await db.from("businesses").update(biz).eq("id", b);
  }
  // The agent learns from every rejection that carries a reason.
  if (decision === "rejected" && note?.trim()) {
    await db.from("memories").insert({
      business_id: b, kind: "preference", importance: 4, source: "user",
      content: `Ο χρήστης απέρριψε: «${approval.summary}». Λόγος: ${note.trim()}`,
    });
  }
  await logActivity({
    orgId: access.org.id, businessId: b, actorType: "user", actorId: access.userId,
    action: `approval.${decision}`, targetType: "approval", targetId: approval.id, details: { action: approval.action, note },
  });
  return NextResponse.json({ ok: true });
}

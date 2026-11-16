import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessAccess } from "@/lib/access";
import { hasRole } from "@/lib/policy";
import { userClient, serviceClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agent/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  businessId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(8000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρο αίτημα" }, { status: 400 });
  const { businessId, message } = parsed.data;

  const access = await getBusinessAccess(businessId);
  if (!access) return NextResponse.json({ error: "Χωρίς πρόσβαση" }, { status: 403 });
  if (!hasRole(access.role, "editor")) return NextResponse.json({ error: "Χρειάζεται ρόλος editor ή υψηλότερος" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Λείπει το ANTHROPIC_API_KEY στον server" }, { status: 503 });

  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    // RLS confirms the conversation belongs to a business this user can see.
    const { data } = await userClient().from("conversations").select("id").eq("id", conversationId).eq("business_id", businessId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Η συζήτηση δεν βρέθηκε" }, { status: 404 });
    const { data: busy } = await serviceClient().from("agent_runs").select("id").eq("conversation_id", conversationId)
      .eq("status", "running").gte("started_at", new Date(Date.now() - 6 * 60_000).toISOString()).limit(1);
    if (busy?.length) return NextResponse.json({ error: "Ο agent δουλεύει ήδη σε αυτή τη συζήτηση" }, { status: 409 });
  } else {
    const { data, error } = await userClient().from("conversations")
      .insert({ business_id: businessId, user_id: access.userId, title: message.slice(0, 80) }).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "conversation" }, { status: 500 });
    conversationId = data.id as string;
  }

  try {
    const result = await runAgent({
      businessId, trigger: "chat", prompt: message, conversationId, userId: access.userId, userRole: access.role,
    });
    return NextResponse.json({ conversationId, ...result });
  } catch (e) {
    console.error("agent chat failed", e);
    return NextResponse.json({ conversationId, error: "Η εκτέλεση του agent απέτυχε. Δες το Activity log." }, { status: 500 });
  }
}

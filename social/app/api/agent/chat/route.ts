import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/access";
import { userClient, serviceClient, supabaseConfigured } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agent/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(8000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρο αίτημα" }, { status: 400 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "Το Supabase δεν είναι ρυθμισμένο στον server" }, { status: 503 });
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Μόνο για admins του Salonicup" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Λείπει το ANTHROPIC_API_KEY στον server" }, { status: 503 });
  const { message } = parsed.data;

  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const { data } = await userClient().from("social_conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Η συζήτηση δεν βρέθηκε" }, { status: 404 });
    const { data: busy } = await serviceClient().from("social_runs").select("id").eq("conversation_id", conversationId)
      .eq("status", "running").gte("started_at", new Date(Date.now() - 6 * 60_000).toISOString()).limit(1);
    if (busy?.length) return NextResponse.json({ error: "Ο agent δουλεύει ήδη σε αυτή τη συζήτηση" }, { status: 409 });
  } else {
    const { data, error } = await userClient().from("social_conversations")
      .insert({ user_id: admin.userId, title: message.slice(0, 80) }).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "conversation" }, { status: 500 });
    conversationId = data.id as string;
  }

  try {
    const result = await runAgent({ trigger: "chat", prompt: message, conversationId, userId: admin.userId });
    return NextResponse.json({ conversationId, ...result });
  } catch (e) {
    console.error("agent chat failed", e);
    return NextResponse.json({ conversationId, error: "Η εκτέλεση του agent απέτυχε. Δες το Activity log." }, { status: 500 });
  }
}

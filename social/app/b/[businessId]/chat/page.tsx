import { requireBusinessAccess } from "@/lib/access";
import { userClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/policy";
import { Chat, type ChatMessage } from "./chat";

export const dynamic = "force-dynamic";

type Block = { type: string; text?: string; name?: string; input?: { query?: string } };

/** Turns stored API content blocks into what the user should see. Tool results stay hidden. */
function toView(role: string, content: unknown): ChatMessage | null {
  const blocks: Block[] = typeof content === "string" ? [{ type: "text", text: content }] : (content as Block[]);
  if (role === "user") {
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").replace(/^\[[^\]]*\]\n\n/, "");
    return text ? { role: "user", text, tools: [] } : null;
  }
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const tools = blocks.flatMap((b) =>
    b.type === "tool_use" ? [b.name!] : b.type === "server_tool_use" ? [`${b.name}${b.input?.query ? `: ${b.input.query}` : ""}`] : []);
  return text || tools.length ? { role: "assistant", text, tools } : null;
}

export default async function ChatPage({ params, searchParams }: { params: { businessId: string }; searchParams: { c?: string } }) {
  const { business, role } = await requireBusinessAccess(params.businessId);
  const db = userClient();
  const { data: conversations } = await db.from("conversations").select("id,title,created_at")
    .eq("business_id", business.id).order("created_at", { ascending: false }).limit(30);
  const current = searchParams.c && conversations?.some((c) => c.id === searchParams.c) ? searchParams.c : null;
  let messages: ChatMessage[] = [];
  if (current) {
    const { data } = await db.from("conversation_messages").select("role,content").eq("conversation_id", current).order("id");
    messages = (data ?? []).map((m) => toView(m.role, m.content)).filter((m): m is ChatMessage => !!m);
  }
  return (
    <Chat businessId={business.id} conversationId={current} initial={messages}
      conversations={conversations ?? []} canWrite={hasRole(role, "editor")} />
  );
}

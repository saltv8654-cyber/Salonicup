"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface ChatMessage { role: "user" | "assistant"; text: string; tools: string[] }

const EXAMPLES = [
  "Δημιούργησε 5 Instagram posts για την επόμενη εβδομάδα",
  "Φτιάξε content plan για τον επόμενο μήνα με καμπάνια",
  "Κάνε έρευνα για τάσεις στον κλάδο μας και πρότεινε 10 ιδέες για Reels",
  "Ανάλαβε τη στρατηγική των social media για τον επόμενο μήνα",
  "Προγραμμάτισε τις δημοσιεύσεις της επόμενης εβδομάδας",
];
const TOOL_LABEL: Record<string, string> = {
  create_content_drafts: "Δημιουργία drafts", create_campaign: "Δημιουργία καμπάνιας", save_memory: "Αποθήκευση στη μνήμη",
  search_memory: "Αναζήτηση μνήμης", update_brand_profile: "Ενημέρωση brand", list_content: "Ανάγνωση calendar",
  update_content: "Επεξεργασία περιεχομένου", schedule_content: "Προγραμματισμός", get_recent_activity: "Ιστορικό",
  delegate_to_specialist: "Ανάθεση σε specialist",
};

export function Chat({ businessId, conversationId, initial, conversations, canWrite }: {
  businessId: string; conversationId: string | null; initial: ChatMessage[];
  conversations: { id: string; title: string }[]; canWrite: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setMessages(initial), [initial]);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setError(null); setInput("");
    setMessages((m) => [...m, { role: "user", text, tools: [] }]);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, conversationId, message: text }),
      });
      const data = await res.json();
      if (!res.ok && !data.conversationId) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.error) setError(data.error);
      // Reload from the database so the view shows exactly what was stored (tools included).
      router.replace(`/b/${businessId}/chat?c=${data.conversationId}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <Link href={`/b/${businessId}/chat`} className="btn-ghost mb-3 w-full">+ Νέα συζήτηση</Link>
        <ul className="space-y-1 text-sm">
          {conversations.map((c) => (
            <li key={c.id}><Link href={`/b/${businessId}/chat?c=${c.id}`}
              className={`block truncate rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${c.id === conversationId ? "bg-slate-100 font-medium dark:bg-slate-800" : ""}`}>{c.title}</Link></li>
          ))}
        </ul>
      </aside>

      <section className="card flex h-[calc(100vh-9rem)] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-8 text-center">
              <p className="text-lg font-semibold">Τι να αναλάβω;</p>
              <p className="muted mt-1">Ο agent δημιουργεί πραγματικά drafts, καμπάνιες και μνήμη στη βάση. Δημοσίευση και analytics απαιτούν συνδεδεμένους λογαριασμούς.</p>
              <div className="mt-6 grid gap-2">
                {EXAMPLES.map((e) => <button key={e} disabled={!canWrite || busy} onClick={() => send(e)} className="btn-ghost justify-start text-left">{e}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={m.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white"
                : "max-w-[95%] text-sm"}>
                {m.tools.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {m.tools.map((t, j) => <span key={j} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">⚙ {TOOL_LABEL[t] ?? t}</span>)}
                  </div>
                )}
                {m.text && <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>}
              </div>
            </div>
          ))}
          {busy && <p className="muted animate-pulse">Ο agent δουλεύει… (έρευνα, δημιουργία, αποθήκευση — μπορεί να πάρει 1–3 λεπτά)</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
          <textarea className="input min-h-[44px] flex-1 resize-none" rows={1} value={input} disabled={!canWrite || busy}
            placeholder={canWrite ? "Γράψε μια εντολή…" : "Ο ρόλος viewer δεν μπορεί να δίνει εντολές"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
          <button className="btn-primary" disabled={!canWrite || busy || !input.trim()}>Αποστολή</button>
        </form>
      </section>
    </div>
  );
}

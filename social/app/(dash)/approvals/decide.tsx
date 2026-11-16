"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Decide({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(decision: "approved" | "rejected") {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note }) });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    router.refresh();
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input className="input min-w-[200px] flex-1" placeholder="Σχόλιο (προαιρετικό — ο agent μαθαίνει από αυτό)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary" disabled={busy} onClick={() => go("approved")}>Έγκριση</button>
      <button className="btn-ghost" disabled={busy} onClick={() => go("rejected")}>Απόρριψη</button>
      {err && <p className="w-full text-sm text-rose-600">{err}</p>}
    </div>
  );
}

"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(params.get("denied") ? "Ο λογαριασμός δεν είναι admin του Salonicup." : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await browserClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    router.replace(next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Salonicup · Social Agent</p>
          <h1 className="mt-1 text-xl font-semibold">Σύνδεση admin</h1>
          <p className="muted mt-1">Με τον ίδιο λογαριασμό που μπαίνεις στο /admin του Salonicup.</p>
        </div>
        <div><label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">Κωδικός</label>
          <input id="pw" className="input" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p className="text-sm text-rose-600">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : "Σύνδεση"}</button>
      </form>
    </main>
  );
}

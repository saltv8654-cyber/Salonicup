"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = browserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error, data } = mode === "signin"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "signup" && !data.session) return setMsg("Στάλθηκε email επιβεβαίωσης. Άνοιξε τον σύνδεσμο για να συνεχίσεις.");
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Social Agent</p>
          <h1 className="mt-1 text-xl font-semibold">{mode === "signin" ? "Σύνδεση" : "Νέος λογαριασμός"}</h1>
        </div>
        <div><label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">Κωδικός</label>
          <input id="pw" className="input" type="password" minLength={8} required autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p className="text-sm text-rose-600">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : mode === "signin" ? "Σύνδεση" : "Δημιουργία"}</button>
        <button type="button" className="muted w-full text-center underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Δεν έχεις λογαριασμό; Εγγραφή" : "Έχεις ήδη λογαριασμό; Σύνδεση"}
        </button>
      </form>
    </main>
  );
}

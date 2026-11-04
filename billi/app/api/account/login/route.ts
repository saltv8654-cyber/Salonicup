import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbConfigured } from "@/lib/db";
import { AuthError, setSessionCookie, signIn, tooManyAttempts } from "@/lib/user-auth";

export const runtime = "nodejs";

const Input = z.object({ email: z.string().trim().toLowerCase().email("Μη έγκυρο email").max(200), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Οι λογαριασμοί δεν είναι ακόμα ενεργοί" }, { status: 503 });
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Συμπλήρωσε email και κωδικό" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooManyAttempts(`login:${ip}`) || tooManyAttempts(`login:${parsed.data.email}`)) {
    return NextResponse.json({ error: "Πολλές προσπάθειες. Δοκίμασε σε 15 λεπτά." }, { status: 429 });
  }
  try {
    const session = await signIn(parsed.data.email, parsed.data.password);
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, session);
    return res;
  } catch (e) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: e instanceof Error ? e.message : "Η σύνδεση απέτυχε" }, { status: e instanceof AuthError ? e.status : 500 });
  }
}

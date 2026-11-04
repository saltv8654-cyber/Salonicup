import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbConfigured } from "@/lib/db";
import { AuthError, setSessionCookie, signUp, tooManyAttempts } from "@/lib/user-auth";

export const runtime = "nodejs";

const Input = z.object({
  email: z.string().trim().toLowerCase().email("Μη έγκυρο email").max(200),
  password: z.string().min(8, "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες").max(200),
  name: z.string().trim().max(60).optional(),
  consent: z.literal(true, { message: "Χρειάζεται να αποδεχτείς την Πολιτική Απορρήτου" }),
});

export async function POST(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Οι λογαριασμοί δεν είναι ακόμα ενεργοί" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooManyAttempts(`signup:${ip}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Πολλές προσπάθειες. Δοκίμασε αργότερα." }, { status: 429 });
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  try {
    const session = await signUp(parsed.data.email, parsed.data.password, parsed.data.name || null);
    const res = NextResponse.json({ ok: true }, { status: 201 });
    setSessionCookie(res, session);
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Η εγγραφή απέτυχε" }, { status: e instanceof AuthError ? e.status : 500 });
  }
}

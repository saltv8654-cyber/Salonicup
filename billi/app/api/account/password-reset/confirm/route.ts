import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbConfigured } from "@/lib/db";
import { readToken } from "@/lib/mailer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const parsed = z.object({ token: z.string().max(500), password: z.string().min(8, "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες").max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  const userId = readToken("reset", parsed.data.token);
  if (!userId || !dbConfigured()) return NextResponse.json({ error: "Ο σύνδεσμος έληξε. Ζήτησε νέο." }, { status: 400 });
  const { error } = await db().auth.admin.updateUserById(userId, { password: parsed.data.password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

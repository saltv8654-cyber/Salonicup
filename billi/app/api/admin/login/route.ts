import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, passwordMatches } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Δεν έχει οριστεί ADMIN_PASSWORD στο Vercel" }, { status: 500 });
  }
  if (typeof body.password !== "string" || !passwordMatches(body.password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "Λάθος κωδικός" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

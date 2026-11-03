import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "billi_admin";

/** Cookie value derived from the password, so changing ADMIN_PASSWORD logs everyone out. */
export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHmac("sha256", pw).update("billi-admin-v1").digest("hex") : null;
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function passwordMatches(given: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && safeEqual(given, pw);
}

export function isAdmin(req: NextRequest): boolean {
  const token = adminToken();
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return !!token && !!cookie && safeEqual(cookie, token);
}

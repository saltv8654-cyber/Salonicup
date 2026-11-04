import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "billi_admin";
const DEFAULT_NAME = "Διαχειριστής";

const sign = (name: string, pw: string) => createHmac("sha256", pw).update(`billi-admin-v2:${name}`).digest("hex");

/** Session cookie for a named administrator, signed with ADMIN_PASSWORD (changing it logs everyone out). */
export function adminCookieValue(name: string): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return `${Buffer.from(name, "utf8").toString("base64url")}.${sign(name, pw)}`;
}

/** Cookie from before administrators had names. */
function legacyToken(pw: string) {
  return createHmac("sha256", pw).update("billi-admin-v1").digest("hex");
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

export const cleanAdminName = (v: unknown) =>
  (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "") || DEFAULT_NAME;

/** The signed-in administrator's name, or null when the request is not from an administrator. */
export function adminName(req: NextRequest): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!pw || !cookie) return null;
  if (safeEqual(cookie, legacyToken(pw))) return DEFAULT_NAME;
  const dot = cookie.indexOf(".");
  if (dot < 1) return null;
  let name: string;
  try {
    name = Buffer.from(cookie.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  return safeEqual(cookie.slice(dot + 1), sign(name, pw)) ? name : null;
}

export const isAdmin = (req: NextRequest) => adminName(req) !== null;

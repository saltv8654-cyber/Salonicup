import { createHmac, timingSafeEqual } from "crypto";

/** Transactional e-mail through Resend (https://resend.com). Everything that mails is skipped when it isn't configured. */
export const mailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.ALERTS_FROM_EMAIL);

export const siteUrl = () => (process.env.PUBLIC_SITE_URL ?? "https://bill-i.vercel.app").replace(/\/+$/, "");

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.ALERTS_FROM_EMAIL, to: [to], subject, text, ...(html ? { html } : {}) }),
    });
    if (!res.ok) console.error("sendMail:", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.error("sendMail:", e);
    return false;
  }
}

const secret = () => `${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:billi-mail-v1`;

/** Signed, expiring token for e-mail links (verify address, reset password). */
export function signToken(purpose: "verify" | "reset" | "unsub", userId: string, hours: number): string {
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const body = `${purpose}.${userId}.${exp}`;
  return `${Buffer.from(body).toString("base64url")}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function readToken(purpose: "verify" | "reset" | "unsub", token: string): string | null {
  const [b, sig] = token.split(".");
  if (!b || !sig) return null;
  const body = Buffer.from(b, "base64url").toString("utf8");
  const want = Buffer.from(createHmac("sha256", secret()).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [p, userId, exp] = body.split(".");
  if (p !== purpose || !userId || Number(exp) < Date.now() / 1000) return null;
  return userId;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

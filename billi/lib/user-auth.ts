import { createClient, type Session, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { db, dbConfigured, supabaseUrl } from "./db";

/**
 * Visitor accounts on Supabase Auth, run entirely from the server: tokens live in an httpOnly cookie,
 * so no Supabase key ever reaches the browser and no extra public environment variables are needed.
 */
export const USER_COOKIE = "billi_session";
const MAX_AGE = 60 * 60 * 24 * 30;

/** A fresh client for one auth call (sign-in / refresh return a session we store ourselves). */
const authClient = () =>
  createClient(supabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });

interface Stored { a: string; r: string }

const encode = (s: Session) => Buffer.from(JSON.stringify({ a: s.access_token, r: s.refresh_token } satisfies Stored)).toString("base64url");
function decode(v?: string): Stored | null {
  if (!v) return null;
  try {
    const o = JSON.parse(Buffer.from(v, "base64url").toString("utf8"));
    return typeof o.a === "string" && typeof o.r === "string" ? o : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, session: Session) {
  res.cookies.set(USER_COOKIE, encode(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}
export const clearSessionCookie = (res: NextResponse) => res.cookies.set(USER_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const authMessage = (m: string) =>
  /invalid login credentials/i.test(m) ? "Λάθος email ή κωδικός"
    : /already (been )?registered|already exists/i.test(m) ? "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδέσου."
    : /password/i.test(m) && /(short|least|weak)/i.test(m) ? "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες"
    : m;

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new AuthError(authMessage(error?.message ?? "Η σύνδεση απέτυχε"), 401);
  return data.session;
}

/** New account, usable at once. The e-mail address is confirmed separately before any alert is mailed to it. */
export async function signUp(email: string, password: string, name: string | null): Promise<Session> {
  const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new AuthError(authMessage(error?.message ?? "Η εγγραφή απέτυχε"));
  await db().from("user_profiles").upsert({ user_id: data.user.id, display_name: name }, { onConflict: "user_id" });
  return signIn(email, password);
}

/** The signed-in visitor, refreshing an expired access token; `session` is set when the cookie must be rewritten. */
export async function currentUser(req: NextRequest): Promise<{ user: User; session: Session | null } | null> {
  if (!dbConfigured()) return null;
  const stored = decode(req.cookies.get(USER_COOKIE)?.value);
  if (!stored) return null;
  const { data } = await db().auth.getUser(stored.a);
  if (data.user) return { user: data.user, session: null };
  const refreshed = await authClient().auth.refreshSession({ refresh_token: stored.r });
  if (refreshed.error || !refreshed.data.session || !refreshed.data.user) return null;
  return { user: refreshed.data.user, session: refreshed.data.session };
}

type Handler = (req: NextRequest, user: User, ctx: { params: Record<string, string> }) => Promise<NextResponse>;

/** Route for signed-in visitors: 401 otherwise, refreshed cookie written back, errors as { error }. */
export function userRoute(handler: Handler) {
  return async (req: NextRequest, ctx: { params: Record<string, string> }) => {
    if (!dbConfigured()) return NextResponse.json({ error: "Οι λογαριασμοί δεν είναι ακόμα ενεργοί" }, { status: 503 });
    const who = await currentUser(req);
    if (!who) {
      const res = NextResponse.json({ error: "unauthorized" }, { status: 401 });
      if (req.cookies.get(USER_COOKIE)) clearSessionCookie(res);
      return res;
    }
    let res: NextResponse;
    try {
      res = await handler(req, who.user, ctx ?? { params: {} });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const missing = /relation .* does not exist|Could not find the table/i.test(msg);
      if (!missing) console.error(e);
      res = NextResponse.json({ error: missing ? "missing_migration" : e instanceof AuthError ? e.message : msg }, { status: missing ? 409 : e instanceof AuthError ? e.status : 500 });
    }
    if (who.session) setSessionCookie(res, who.session);
    return res;
  };
}

// Best-effort guard per serverless instance against password guessing.
const attempts = new Map<string, number[]>();
export function tooManyAttempts(key: string, max = 8, windowMs = 15 * 60_000) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > max;
}

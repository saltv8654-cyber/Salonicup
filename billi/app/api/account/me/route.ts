import { NextResponse } from "next/server";
import { overview } from "@/lib/account";
import { db } from "@/lib/db";
import { clearSessionCookie, userRoute } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = userRoute(async (_req, user) => NextResponse.json(await overview(user.id, user.email ?? null)));

/** Delete the account and everything stored with it (profile, bills, alerts cascade with auth.users). */
export const DELETE = userRoute(async (_req, user) => {
  await db().from("leads").update({ user_id: null }).eq("user_id", user.id);
  const { error } = await db().auth.admin.deleteUser(user.id);
  if (error) throw new Error(error.message);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});

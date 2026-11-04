import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userRoute } from "@/lib/user-auth";

export const runtime = "nodejs";

/** Mark alerts as read: { ids: [...] } or { all: true }. */
export const POST = userRoute(async (req, user) => {
  const body = await req.json().catch(() => ({}));
  let q = db().from("user_alerts").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (!body.all) {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 100) : [];
    if (!ids.length) return NextResponse.json({ ok: true });
    q = q.in("id", ids);
  }
  const { error } = await q;
  if (error) throw new Error(error.message);
  return NextResponse.json({ ok: true });
});

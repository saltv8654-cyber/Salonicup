import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userRoute } from "@/lib/user-auth";

export const runtime = "nodejs";

export const DELETE = userRoute(async (_req, user, { params }) => {
  const { error } = await db().from("user_bills").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return NextResponse.json({ ok: true });
});

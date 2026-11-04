import { NextRequest, NextResponse } from "next/server";
import { db, dbConfigured } from "@/lib/db";
import { readToken, siteUrl } from "@/lib/mailer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = readToken("verify", req.nextUrl.searchParams.get("token") ?? "");
  if (!userId || !dbConfigured()) return NextResponse.redirect(`${siteUrl()}/account?verified=0`);
  await db().from("user_profiles").upsert({ user_id: userId, email_verified_at: new Date().toISOString(), email_alerts: true }, { onConflict: "user_id" });
  return NextResponse.redirect(`${siteUrl()}/account?verified=1`);
}

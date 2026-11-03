import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";
import { TelecomInput, cleanTelecom, isMissingTable, slug } from "@/lib/tariff-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const { data, error } = await db().from("telecom_plans").select("*").order("provider").order("name").limit(1000);
  if (error) {
    const missing = isMissingTable(error.message, "telecom_plans");
    return NextResponse.json({ error: missing ? "missing_table" : error.message }, { status: missing ? 409 : 500 });
  }
  return NextResponse.json({ plans: data });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = TelecomInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  const t = parsed.data;
  const id = `${slug(t.provider)}-${slug(t.name)}-${Date.now().toString(36)}`;
  const { data, error } = await db().from("telecom_plans").insert({ id, ...cleanTelecom(t), active: t.active ?? true }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data }, { status: 201 });
}

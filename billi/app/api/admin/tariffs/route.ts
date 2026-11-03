import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";
import { TariffInput, clean, slug } from "@/lib/tariff-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const { data, error } = await db().from("tariffs").select("*").order("provider").order("name").limit(1000);
  if (error) {
    const missing = /relation .*tariffs.* does not exist|Could not find the table/i.test(error.message);
    return NextResponse.json({ error: missing ? "missing_table" : error.message }, { status: missing ? 409 : 500 });
  }
  return NextResponse.json({ tariffs: data });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = TariffInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  const t = parsed.data;
  const id = `${slug(t.provider)}-${slug(t.name)}-${Date.now().toString(36)}`;
  const { data, error } = await db().from("tariffs").insert({ id, ...clean(t), active: t.active ?? true }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tariff: data }, { status: 201 });
}

/** Bulk action on all rows: move every active programme to a new month after checking prices. */
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.valid_month !== "string" || !/^\d{4}-\d{2}$/.test(body.valid_month)) {
    return NextResponse.json({ error: "Μήνας σε μορφή ΕΕΕΕ-ΜΜ" }, { status: 400 });
  }
  const { error, count } = await db()
    .from("tariffs")
    .update({ valid_month: body.valid_month, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: count ?? null });
}

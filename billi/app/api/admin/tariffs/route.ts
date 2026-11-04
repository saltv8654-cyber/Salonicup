import { NextRequest, NextResponse } from "next/server";
import { adminName, isAdmin } from "@/lib/admin-auth";
import { logActivity } from "@/lib/audit";
import { db, dbConfigured } from "@/lib/db";
import { TariffInput, clean, isMissingCategory, slug, writeTariff } from "@/lib/tariff-input";

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
  // Has the gas upgrade (category column) been applied?
  const probe = await db().from("tariffs").select("category").limit(1);
  return NextResponse.json({ tariffs: data, has_category: !probe.error || !isMissingCategory(probe.error.message) });
}

export async function POST(req: NextRequest) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = TariffInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  const t = parsed.data;
  const id = `${slug(t.provider)}-${slug(t.name)}-${Date.now().toString(36)}`;
  const { data, error } = await writeTariff({ id, ...clean(t, admin), active: t.active ?? true }, (r) => db().from("tariffs").insert(r).select().single());
  if (error) return NextResponse.json({ error: error.message }, { status: error.message === "missing_category" ? 409 : 500 });
  await logActivity({ admin, action: "tariff_create", entity: "tariffs", entity_id: id, after: data, source_url: t.url || null });
  return NextResponse.json({ tariff: data }, { status: 201 });
}

/** Bulk action on all rows: move every active programme to a new month after checking prices. */
export async function PATCH(req: NextRequest) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.valid_month !== "string" || !/^\d{4}-\d{2}$/.test(body.valid_month)) {
    return NextResponse.json({ error: "Μήνας σε μορφή ΕΕΕΕ-ΜΜ" }, { status: 400 });
  }
  let withBy = true;
  const update = (withCategory: boolean) => {
    let q = db().from("tariffs").update({ valid_month: body.valid_month, updated_at: new Date().toISOString(), ...(withBy ? { updated_by: admin } : {}) }, { count: "exact" }).eq("active", true);
    if (withCategory) q = q.eq("category", body.category);
    return q;
  };
  const wanted = body.category === "gas" || body.category === "electricity";
  let { error, count } = await update(wanted);
  if (error && /updated_by/.test(error.message)) {
    withBy = false; // before the energy-data migration
    ({ error, count } = await update(wanted));
  }
  // Before the gas upgrade every row is electricity.
  if (error && wanted && isMissingCategory(error.message) && body.category === "electricity") ({ error, count } = await update(false));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity({ admin, action: "tariff_month_change", entity: "tariffs", after: { valid_month: body.valid_month, category: body.category ?? null, updated: count ?? null } });
  return NextResponse.json({ updated: count ?? null });
}

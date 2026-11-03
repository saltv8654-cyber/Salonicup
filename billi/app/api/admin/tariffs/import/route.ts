import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";
import { bundledTariffs } from "@/lib/tariffs";
import { isMissingCategory } from "@/lib/tariff-input";

export const runtime = "nodejs";

/** One-off: copy the programmes from data/tariffs.json (or data/gas.json with ?category=gas) into the editable table. Existing ids are left alone. */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const category = req.nextUrl.searchParams.get("category") === "gas" ? "gas" : "electricity";
  const rows = bundledTariffs(category).tariffs.map((t) => ({
    id: t.id,
    provider: t.provider,
    name: t.name,
    color: t.color,
    fixed_monthly_eur: t.fixed_monthly_eur,
    price_per_kwh_eur: t.price_per_kwh_eur,
    price_per_kwh_with_discount_eur: t.price_per_kwh_with_discount_eur ?? null,
    discount_condition: t.discount_condition ?? null,
    min_duration_months: t.min_duration_months ?? null,
    valid_month: t.valid_month,
    url: t.url ?? null,
    active: true,
  }));
  const upsert = (r: Record<string, unknown>[]) => db().from("tariffs").upsert(r, { onConflict: "id", ignoreDuplicates: true });
  let { error } = await upsert(rows.map((r) => ({ ...r, category })));
  if (error && isMissingCategory(error.message)) {
    if (category === "gas") return NextResponse.json({ error: "missing_category" }, { status: 400 });
    ({ error } = await upsert(rows));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: rows.length });
}

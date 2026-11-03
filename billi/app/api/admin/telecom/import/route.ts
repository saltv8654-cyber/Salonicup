import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";
import { bundledTelecomFile } from "@/lib/tariffs";

export const runtime = "nodejs";

/** One-off: copy the indicative plans from data/telecom.json into the editable table. */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const rows = bundledTelecomFile().plans.map((p) => ({
    id: p.id, kind: p.kind, provider: p.provider, name: p.name, monthly_eur: p.monthly_eur,
    promo_eur: p.promo_eur ?? null, promo_months: p.promo_months ?? null, commitment_months: p.commitment_months ?? null,
    speed_mbps: p.speed_mbps ?? null, tech: p.tech ?? null, data_gb: p.data_gb ?? null, notes: p.notes ?? null,
    valid_month: p.valid_month, url: p.url ?? null, active: true,
  }));
  const { error } = await db().from("telecom_plans").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: rows.length });
}

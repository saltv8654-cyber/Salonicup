import { NextRequest, NextResponse } from "next/server";
import { adminName } from "@/lib/admin-auth";
import { logActivity } from "@/lib/audit";
import { db, dbConfigured } from "@/lib/db";
import { TariffInput, clean, writeTariff } from "@/lib/tariff-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = TariffInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  const before = (await db().from("tariffs").select("*").eq("id", params.id).maybeSingle()).data;
  const { data, error } = await writeTariff(clean(parsed.data, admin), (r) => db().from("tariffs").update(r).eq("id", params.id).select().single());
  if (error) return NextResponse.json({ error: error.message }, { status: error.message === "missing_category" ? 409 : 500 });
  await logActivity({ admin, action: "tariff_update", entity: "tariffs", entity_id: params.id, before, after: data, source_url: parsed.data.url || null });
  return NextResponse.json({ tariff: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const before = (await db().from("tariffs").select("*").eq("id", params.id).maybeSingle()).data;
  // Name who deletes it, so the history row written by the database trigger says so.
  await db().from("tariffs").update({ updated_by: admin }).eq("id", params.id);
  const { error } = await db().from("tariffs").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity({ admin, action: "tariff_delete", entity: "tariffs", entity_id: params.id, before });
  return NextResponse.json({ ok: true });
}

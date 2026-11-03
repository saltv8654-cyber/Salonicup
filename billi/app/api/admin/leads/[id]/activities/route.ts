import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";

const Activity = z.object({
  type: z.enum(["note", "call", "email"]),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = Activity.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Γράψε κάτι στη σημείωση" }, { status: 400 });

  const { data, error } = await db().from("lead_activities").insert({ lead_id: params.id, ...parsed.data }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from("leads").update({ updated_at: new Date().toISOString() }).eq("id", params.id);
  return NextResponse.json({ activity: data }, { status: 201 });
}

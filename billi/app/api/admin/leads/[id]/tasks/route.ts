import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminName } from "@/lib/admin-auth";
import { db, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";

const Input = z.object({ title: z.string().trim().min(1, "Γράψε τι πρέπει να γίνει").max(200), due_at: z.string().datetime({ offset: true }) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  const { data, error } = await db().from("lead_tasks").insert({ lead_id: params.id, created_by: admin, ...parsed.data }).select().single();
  if (error) return NextResponse.json({ error: /does not exist|Could not find the table/i.test(error.message) ? "missing_tasks" : error.message }, { status: 409 });
  await db().from("lead_activities").insert({ lead_id: params.id, type: "note", body: `📌 Εργασία: ${parsed.data.title} (${new Date(parsed.data.due_at).toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" })}) · ${admin}` });
  return NextResponse.json({ task: data }, { status: 201 });
}

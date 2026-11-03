import { NextRequest, NextResponse } from "next/server";
import { db, dbConfigured } from "@/lib/db";
import { BILL_TYPES, MAX_BILL_BYTES, attachTokenValid, billFileOf, uploadBill } from "@/lib/bill-files";

export const runtime = "nodejs";

/** Visitor attaches the bill they analysed to the request they just sent (explicit opt-in in the form). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!dbConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const file = form?.get("file");
  if (typeof token !== "string" || !attachTokenValid(params.id, token)) {
    return NextResponse.json({ error: "Μη έγκυρο αίτημα" }, { status: 403 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν βρέθηκε αρχείο" }, { status: 400 });
  if (!BILL_TYPES[file.type]) return NextResponse.json({ error: "Μόνο PDF ή εικόνα" }, { status: 415 });
  if (file.size > MAX_BILL_BYTES) return NextResponse.json({ error: "Το αρχείο είναι πάνω από 4 MB" }, { status: 413 });

  const { data: lead, error } = await db().from("leads").select("id, created_at, bill").eq("id", params.id).single();
  if (error || !lead) return NextResponse.json({ error: "Δεν βρέθηκε το αίτημα" }, { status: 404 });
  // Only right after the form is sent, and only once.
  if (Date.now() - new Date(lead.created_at).getTime() > 30 * 60_000 || billFileOf(lead.bill)) {
    return NextResponse.json({ error: "Το αίτημα δεν δέχεται πλέον αρχείο" }, { status: 409 });
  }

  try {
    const meta = await uploadBill(params.id, Buffer.from(await file.arrayBuffer()), file.type, file.name);
    await db().from("leads").update({ bill: { ...((lead.bill as object) ?? {}), _file: meta } }).eq("id", params.id);
    await db().from("lead_activities").insert({ lead_id: params.id, type: "system", body: `📎 Επισυνάφθηκε ο λογαριασμός (${file.type === "application/pdf" ? "PDF" : "εικόνα"}, ${Math.round(file.size / 1024)} KB)` });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e: any) {
    console.error("bill upload failed:", e);
    return NextResponse.json({ error: "Δεν αποθηκεύτηκε το αρχείο" }, { status: 500 });
  }
}

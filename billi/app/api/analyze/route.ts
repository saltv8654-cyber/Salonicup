import { NextRequest, NextResponse } from "next/server";
import { extractBill, validate } from "@/lib/extract";
import { compare } from "@/lib/compare";
import { loadTariffs } from "@/lib/tariffs";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Δεν βρέθηκε αρχείο" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Το αρχείο ξεπερνά τα 10 MB" }, { status: 413 });
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const mimeType = isPdf ? "application/pdf" : file.type;
    if (!isPdf && !IMAGE_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Υποστηρίζονται PDF, JPG, PNG και WEBP. Για φωτογραφίες iPhone (HEIC) κάνε στιγμιότυπο οθόνης." },
        { status: 415 },
      );
    }

    const bill = await extractBill({ buffer: Buffer.from(await file.arrayBuffer()), mimeType, name: file.name });
    const warnings = validate(bill);
    const { tariffs, updated_at } = loadTariffs();

    return NextResponse.json({
      bill,
      warnings,
      comparison: bill.kwh_total ? compare(bill, tariffs) : null,
      tariffs_updated_at: updated_at,
    });
  } catch (err: any) {
    console.error("analyze error:", err);
    const msg = err instanceof SyntaxError ? "Το AI δεν επέστρεψε έγκυρα δεδομένα. Δοκίμασε ξανά." : err?.message ?? "Άγνωστο σφάλμα";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractBill, extractTelecom, validate, validateTelecom, type ImageType } from "@/lib/extract";
import { compare } from "@/lib/compare";
import { loadTariffs, loadTelecom } from "@/lib/tariffs";
import { compareTelecom, needsFromBill } from "@/lib/telecom";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES: string[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Λείπει το ANTHROPIC_API_KEY στις ρυθμίσεις του server" }, { status: 500 });
  }
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
    const mimeType = isPdf ? "application/pdf" : (file.type as ImageType);
    if (!isPdf && !IMAGE_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Υποστηρίζονται PDF, JPG, PNG και WEBP. Για φωτογραφίες iPhone (HEIC) κάνε στιγμιότυπο οθόνης." },
        { status: 415 },
      );
    }

    const cat = form.get("category");
    const category: Category = cat === "gas" || cat === "telecom" ? cat : "electricity";
    const input = { buffer: Buffer.from(await file.arrayBuffer()), mimeType: mimeType as "application/pdf" | ImageType };

    if (category === "telecom") {
      const telecom = await extractTelecom(input);
      const { plans, updated_at } = await loadTelecom();
      return NextResponse.json({
        category,
        telecom,
        warnings: validateTelecom(telecom),
        telecomComparison: compareTelecom(plans, needsFromBill(telecom)),
        tariffs_updated_at: updated_at,
      });
    }

    const bill = await extractBill(input, category);
    const warnings = validate(bill);
    if (category === "gas") warnings.push("Για το αέριο η ετήσια κατανάλωση εκτιμάται με εποχικό προφίλ θέρμανσης, γιατί ο χειμώνας καίει πολύ περισσότερο από το καλοκαίρι.");
    const { tariffs, updated_at } = await loadTariffs(category);

    return NextResponse.json({
      category,
      bill,
      warnings,
      comparison: bill.kwh_total ? compare(bill, tariffs, category) : null,
      tariffs_updated_at: updated_at,
    });
  } catch (err: any) {
    console.error("analyze error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Λείπει ή είναι λάθος το ANTHROPIC_API_KEY" }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Πολλά αιτήματα. Δοκίμασε ξανά σε λίγο." }, { status: 429 });
    }
    if (err instanceof Anthropic.BadRequestError) {
      const detail: string = (err.error as any)?.error?.message ?? err.message;
      if (/credit balance/i.test(detail)) {
        return NextResponse.json({ error: "Δεν υπάρχει υπόλοιπο στον λογαριασμό Anthropic. Φόρτωσε credits στο console.anthropic.com." }, { status: 502 });
      }
      if (/image|5 ?MB|dimensions/i.test(detail)) {
        return NextResponse.json({ error: "Η φωτογραφία δεν έγινε δεκτή (πολύ μεγάλη ή μη έγκυρη). Δοκίμασε στιγμιότυπο οθόνης ή PDF." }, { status: 422 });
      }
      return NextResponse.json({ error: `Σφάλμα ανάλυσης (400): ${detail}` }, { status: 502 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Σφάλμα ανάλυσης (${err.status ?? "δίκτυο"}). Δοκίμασε ξανά.` }, { status: 502 });
    }
    return NextResponse.json({ error: err?.message ?? "Άγνωστο σφάλμα" }, { status: 500 });
  }
}

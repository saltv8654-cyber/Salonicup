import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Bill } from "./types";

const SYSTEM_PROMPT = `
Είσαι ειδικός στην ανάλυση ελληνικών λογαριασμών ρεύματος. Θα λάβεις έναν λογαριασμό (PDF ή φωτογραφία)
και θα εξαγάγεις τα στοιχεία του.

ΚΑΝΟΝΕΣ:
1. Εξάγεις τιμές ΜΟΝΟ από το σωστό σημείο του λογαριασμού. Ποτέ μην μαντεύεις.
2. Ποσά σε EUR ως αριθμοί (π.χ. 12.34).
3. Αν ένα πεδίο δεν υπάρχει στον λογαριασμό, επιστρέφεις null (ποτέ 0 για ελλιπή στοιχεία).
4. Η έκπτωση συνέπειας / έγκαιρης πληρωμής επιστρέφεται ως θετικός αριθμός.
5. fixed_monthly_fee = το ΜΗΝΙΑΙΟ πάγιο του προγράμματος (όχι αναλογικό ανά ημέρα).
6. kwh_rate = τιμή ενέργειας προμήθειας σε €/kWh όπως αναγράφεται (χωρίς ρυθμιζόμενες χρεώσεις).
7. billing_days από το διάστημα κατανάλωσης. is_estimate = true αν η μέτρηση είναι εκτιμώμενη.

ΧΡΩΜΑ ΤΙΜΟΛΟΓΙΟΥ (tariff_color):
Από το 2024 κάθε λογαριασμός αναγράφει το χρώμα του τιμολογίου. Το χρώμα αφορά τον τρόπο τιμολόγησης,
ΟΧΙ το αν η ενέργεια είναι «πράσινη»/ΑΠΕ.
- Μπλε τιμολόγιο / Σταθερό → "blue"
- Πράσινο τιμολόγιο / κυμαινόμενο με τιμή που ανακοινώνεται στην αρχή του μήνα → "green"
- Κίτρινο τιμολόγιο / κυμαινόμενο με βάση τη χονδρεμπορική, μηχανισμός διακύμανσης → "yellow"
- Πορτοκαλί τιμολόγιο / δυναμικό / ωριαίες τιμές → "orange"
Αν δεν αναγράφεται και δεν προκύπτει καθαρά, επιστρέφεις null.
`;

const num = z.number().nullable();
const str = z.string().nullable();

const BillSchema = z.object({
  provider: str,
  program_name: str,
  tariff_color: z.enum(["blue", "green", "yellow", "orange"]).nullable(),
  period_start: str,
  period_end: str,
  billing_days: num,
  kwh_total: num,
  kwh_day: num,
  kwh_night: num,
  kwh_rate: num,
  kwh_rate_night: num,
  fixed_monthly_fee: num,
  energy_charge_gross: num,
  consistency_discount: num,
  net_energy_charge: num,
  supplier_total: num,
  regulated_total: num,
  municipal_total: num,
  efk_total: num,
  vat_amount: num,
  total_due: num,
  is_estimate: z.boolean().nullable(),
});

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic();
  return client;
}

export function validate(bill: Bill): string[] {
  const w: string[] = [];
  if (!bill.provider) w.push("Δεν αναγνωρίστηκε πάροχος");
  if (!bill.kwh_total || bill.kwh_total <= 0) w.push("Δεν βρέθηκε κατανάλωση kWh");
  else if (bill.kwh_total > 5000) w.push("Ασυνήθιστα υψηλή κατανάλωση για οικιακό λογαριασμό. Έλεγξε την τιμή.");
  if (!bill.billing_days) w.push("Δεν βρέθηκαν ημέρες κατανάλωσης. Η ετήσια εκτίμηση θεωρεί 30 ημέρες.");
  if (!bill.total_due || bill.total_due <= 0) w.push("Δεν βρέθηκε σύνολο πληρωμής");
  if (!bill.tariff_color) w.push("Δεν αναγνωρίστηκε το χρώμα τιμολογίου");
  if (bill.is_estimate) w.push("Ο λογαριασμός βασίζεται σε εκτιμώμενη μέτρηση");

  const parts = [bill.supplier_total, bill.regulated_total, bill.municipal_total, bill.efk_total, bill.vat_amount];
  if (bill.total_due && parts.every((p) => p !== null)) {
    const sum = parts.reduce((a, b) => a! + b!, 0)!;
    if (Math.abs(sum - bill.total_due) > 0.5) {
      w.push(`Τα επιμέρους ποσά (${sum.toFixed(2)} €) δεν ταιριάζουν με το σύνολο (${bill.total_due.toFixed(2)} €). Ίσως υπάρχουν προηγούμενα υπόλοιπα ή συμψηφισμοί.`);
    }
  }
  return w;
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function extractBill(file: { buffer: Buffer; mimeType: "application/pdf" | ImageType }): Promise<Bill> {
  const data = file.buffer.toString("base64");
  const source: Anthropic.ContentBlockParam =
    file.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: file.mimeType, data } };

  // Haiku: cheapest tier, accurate enough for reading a bill. It has no server-side fallback on refusal.
  const res = await anthropic().messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: zodOutputFormat(BillSchema) },
    messages: [{ role: "user", content: [source, { type: "text", text: "Ανάλυσε αυτόν τον λογαριασμό ρεύματος." }] }],
  });

  if (res.stop_reason === "refusal") throw new Error("Το AI αρνήθηκε να αναλύσει το αρχείο. Δοκίμασε άλλο αρχείο.");
  if (res.stop_reason === "max_tokens" || !res.parsed_output) throw new Error("Το AI δεν επέστρεψε έγκυρα δεδομένα. Δοκίμασε ξανά.");

  const bill = res.parsed_output;
  if (bill.consistency_discount !== null) bill.consistency_discount = Math.abs(bill.consistency_discount);
  return bill;
}

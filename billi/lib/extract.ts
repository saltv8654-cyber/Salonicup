import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import type { Bill, TariffColor } from "./types";

const SYSTEM_PROMPT = `
Είσαι ειδικός στην ανάλυση ελληνικών λογαριασμών ρεύματος. Θα λάβεις έναν λογαριασμό (PDF ή φωτογραφία).

ΚΑΝΟΝΕΣ:
1. Εξάγεις τιμές ΜΟΝΟ από το σωστό σημείο του λογαριασμού. Ποτέ μην μαντεύεις.
2. Ποσά σε EUR ως αριθμοί με τελεία για δεκαδικά (π.χ. 12.34), χωρίς σύμβολο €.
3. Αν ένα πεδίο δεν υπάρχει, επιστρέφεις null (ποτέ 0 για ελλιπή στοιχεία).
4. Η έκπτωση συνέπειας / έγκαιρης πληρωμής επιστρέφεται ως θετικός αριθμός.
5. fixed_monthly_fee = το ΜΗΝΙΑΙΟ πάγιο του προγράμματος (όχι αναλογικό ανά ημέρα).
6. kwh_rate = τιμή ενέργειας προμήθειας σε €/kWh όπως αναγράφεται (χωρίς ρυθμιζόμενες χρεώσεις).
7. billing_days από το διάστημα κατανάλωσης. is_estimate = true αν η μέτρηση είναι εκτιμώμενη.

ΧΡΩΜΑ ΤΙΜΟΛΟΓΙΟΥ (tariff_color: "blue" | "green" | "yellow" | "orange"):
Από το 2024 κάθε λογαριασμός αναγράφει το χρώμα του τιμολογίου. Το χρώμα αφορά τον τρόπο τιμολόγησης,
ΟΧΙ το αν η ενέργεια είναι «πράσινη»/ΑΠΕ.
- Μπλε τιμολόγιο / Σταθερό → "blue"
- Πράσινο τιμολόγιο / κυμαινόμενο με τιμή που ανακοινώνεται στην αρχή του μήνα → "green"
- Κίτρινο τιμολόγιο / κυμαινόμενο με βάση τη χονδρεμπορική, μηχανισμός διακύμανσης → "yellow"
- Πορτοκαλί τιμολόγιο / δυναμικό / ωριαίες τιμές → "orange"
Αν δεν αναγράφεται και δεν προκύπτει καθαρά, επιστρέφεις null.

Επιστρέφεις ΜΟΝΟ ένα JSON αντικείμενο με ακριβώς αυτά τα πεδία:
{
  "provider": null, "program_name": null, "tariff_color": null,
  "period_start": null, "period_end": null, "billing_days": null,
  "kwh_total": null, "kwh_day": null, "kwh_night": null,
  "kwh_rate": null, "kwh_rate_night": null, "fixed_monthly_fee": null,
  "energy_charge_gross": null, "consistency_discount": null, "net_energy_charge": null,
  "supplier_total": null, "regulated_total": null, "municipal_total": null,
  "efk_total": null, "vat_amount": null, "total_due": null, "is_estimate": null
}
`;

const COLORS: TariffColor[] = ["blue", "green", "yellow", "orange"];
const NUMERIC_FIELDS = [
  "billing_days", "kwh_total", "kwh_day", "kwh_night", "kwh_rate", "kwh_rate_night",
  "fixed_monthly_fee", "energy_charge_gross", "consistency_discount", "net_energy_charge",
  "supplier_total", "regulated_total", "municipal_total", "efk_total", "vat_amount", "total_due",
] as const;

let client: OpenAI | null = null;
function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[€\s]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalize(raw: any): Bill {
  const bill: any = {};
  for (const k of ["provider", "program_name", "period_start", "period_end"]) {
    bill[k] = typeof raw[k] === "string" && raw[k].trim() ? raw[k].trim() : null;
  }
  for (const k of NUMERIC_FIELDS) bill[k] = toNumber(raw[k]);
  if (bill.consistency_discount !== null) bill.consistency_discount = Math.abs(bill.consistency_discount);
  const color = String(raw.tariff_color ?? "").toLowerCase();
  bill.tariff_color = COLORS.includes(color as TariffColor) ? color : null;
  bill.is_estimate = typeof raw.is_estimate === "boolean" ? raw.is_estimate : null;
  return bill as Bill;
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

export async function extractBill(file: { buffer: Buffer; mimeType: string; name: string }): Promise<Bill> {
  const b64 = file.buffer.toString("base64");
  const part: ChatCompletionContentPart =
    file.mimeType === "application/pdf"
      ? { type: "file", file: { filename: file.name, file_data: `data:application/pdf;base64,${b64}` } }
      : { type: "image_url", image_url: { url: `data:${file.mimeType};base64,${b64}`, detail: "high" } };

  const res = await openai().chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: [{ type: "text", text: "Ανάλυσε αυτόν τον λογαριασμό ρεύματος." }, part] },
    ],
  });

  const content = res.choices[0]?.message.content ?? "";
  return normalize(JSON.parse(content));
}

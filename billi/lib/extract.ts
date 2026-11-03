import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Bill, EnergyCategory, TelecomBill } from "./types";

const ELECTRICITY_PROMPT = `
Είσαι ειδικός στην ανάλυση ελληνικών λογαριασμών ρεύματος. Θα λάβεις έναν λογαριασμό (PDF ή φωτογραφία)
και θα εξαγάγεις τα στοιχεία του.

ΚΑΝΟΝΕΣ:
1. Εξάγεις τιμές ΜΟΝΟ από το σωστό σημείο του λογαριασμού. Ποτέ μην μαντεύεις.
2. Ποσά σε EUR ως αριθμοί (π.χ. 12.34).
3. Αν ένα πεδίο δεν υπάρχει στον λογαριασμό, επιστρέφεις null (ποτέ 0 για ελλιπή στοιχεία).
4. Η έκπτωση συνέπειας / έγκαιρης πληρωμής επιστρέφεται ως θετικός αριθμός.
5. fixed_monthly_fee = το Πάγιο Τέλος όπως αναγράφεται στον λογαριασμό.
6. kwh_rate = τιμή ενέργειας προμήθειας σε €/kWh όπως αναγράφεται (χωρίς ρυθμιζόμενες χρεώσεις).
7. net_energy_charge = χρέωση ενέργειας μείον εκπτώσεις, ΧΩΡΙΣ το πάγιο.
   supplier_total = το σύνολο της ενότητας προμήθειας (πάγιο + ενέργεια − εκπτώσεις).
   Παράδειγμα: Πάγιο 9,57 · Ενέργεια 98 kWh × 0,199 = 19,50 · Έκπτωση −10,88 · Σύνολο προμήθειας 18,19
   → fixed_monthly_fee 9.57, energy_charge_gross 19.50, consistency_discount 10.88,
     net_energy_charge 8.62, supplier_total 18.19.
8. billing_days από το διάστημα κατανάλωσης. is_estimate = true αν η μέτρηση είναι εκτιμώμενη.

ΧΡΩΜΑ ΤΙΜΟΛΟΓΙΟΥ (tariff_color):
Από το 2024 κάθε λογαριασμός αναγράφει το χρώμα του τιμολογίου. Το χρώμα αφορά τον τρόπο τιμολόγησης,
ΟΧΙ το αν η ενέργεια είναι «πράσινη»/ΑΠΕ.
- Μπλε τιμολόγιο / Σταθερό → "blue"
- Πράσινο τιμολόγιο / κυμαινόμενο με τιμή που ανακοινώνεται στην αρχή του μήνα → "green"
- Κίτρινο τιμολόγιο / κυμαινόμενο με βάση τη χονδρεμπορική, μηχανισμός διακύμανσης → "yellow"
- Πορτοκαλί τιμολόγιο / δυναμικό / ωριαίες τιμές → "orange"
Αν δεν αναγράφεται και δεν προκύπτει καθαρά, επιστρέφεις null.
`;

const GAS_PROMPT = `
Είσαι ειδικός στην ανάλυση ελληνικών λογαριασμών ΦΥΣΙΚΟΥ ΑΕΡΙΟΥ. Θα λάβεις έναν λογαριασμό (PDF ή φωτογραφία)
και θα εξαγάγεις τα στοιχεία του στα ίδια πεδία που χρησιμοποιούμε και για το ρεύμα.

ΚΑΝΟΝΕΣ:
1. Εξάγεις τιμές ΜΟΝΟ από το σωστό σημείο του λογαριασμού. Ποτέ μην μαντεύεις.
2. Ποσά σε EUR ως αριθμοί (π.χ. 12.34). Αν ένα πεδίο δεν υπάρχει, επιστρέφεις null.
3. kwh_total = κατανάλωση της περιόδου σε kWh. Ο λογαριασμός δείχνει συνήθως m³ και τη μετατροπή τους σε kWh
   (με τον συντελεστή θερμογόνου δύναμης): χρησιμοποίησε τις kWh, ΟΧΙ τα m³.
4. kwh_rate = τιμή προμήθειας αερίου σε €/kWh (χωρίς τέλη διανομής/δικτύου, φόρους).
5. fixed_monthly_fee = το πάγιο προμήθειας της περιόδου όπως αναγράφεται.
6. supplier_total = σύνολο χρεώσεων προμήθειας (πάγιο + ενέργεια − εκπτώσεις), χωρίς διανομή, φόρους, ΦΠΑ.
   regulated_total = χρεώσεις διανομής/δικτύου. efk_total = ΕΦΚ και λοιποί φόροι. municipal_total = null.
7. period_start / period_end = ημερομηνίες της περιόδου κατανάλωσης (ΗΗ/ΜΜ/ΕΕΕΕ). billing_days από αυτές.
8. Η έκπτωση συνέπειας επιστρέφεται ως θετικός αριθμός. is_estimate = true αν η μέτρηση είναι εκτιμώμενη.

ΤΥΠΟΣ ΤΙΜΟΛΟΓΙΟΥ (tariff_color):
- Σταθερό / μπλε → "blue"
- Κυμαινόμενο που ανακοινώνεται την 1η του μήνα / πράσινο → "green"
- Κυμαινόμενο με βάση δείκτη (TTF, ΤΕΑ κ.λπ.) / κίτρινο → "yellow"
Αν δεν προκύπτει καθαρά, επιστρέφεις null.
`;

const TELECOM_PROMPT = `
Είσαι ειδικός στην ανάλυση ελληνικών λογαριασμών τηλεπικοινωνιών (Cosmote, Vodafone, Nova κ.λπ.): σταθερό
internet, κινητή ή πακέτο και των δύο. Θα λάβεις τον λογαριασμό (PDF ή φωτογραφία).

ΚΑΝΟΝΕΣ:
1. Μόνο ό,τι γράφει ο λογαριασμός. Αν κάτι λείπει, null.
2. Ποσά σε EUR ως αριθμοί, ΜΕ ΦΠΑ, μηνιαία (αν η περίοδος είναι δίμηνη, διαίρεσε με 2).
3. has_internet = υπάρχει σταθερό internet (ADSL, VDSL, οπτική ίνα, 5G/FWA για σπίτι).
   internet_speed_mbps = ονομαστική ταχύτητα σε Mbps (π.χ. «Fiber 300» → 300, «VDSL 50» → 50).
   internet_monthly_eur = μηνιαίο πάγιο του internet/σταθερής.
4. has_mobile = υπάρχει συμβόλαιο κινητής. mobile_lines = πλήθος γραμμών.
   mobile_data_gb = GB data τον μήνα ανά γραμμή· mobile_unlimited_data = true αν τα data είναι απεριόριστα.
   mobile_monthly_eur = μηνιαίο πάγιο όλων των γραμμών κινητής μαζί.
5. Αν είναι ενιαίο πακέτο χωρίς ανάλυση, βάλε όλο το ποσό στο internet_monthly_eur και mobile_monthly_eur null.
6. total_due = σύνολο πληρωμής του λογαριασμού.
`;

const TelecomSchema = z.object({
  provider: z.string().nullable(),
  plan_name: z.string().nullable(),
  has_internet: z.boolean(),
  has_mobile: z.boolean(),
  internet_speed_mbps: z.number().nullable(),
  internet_monthly_eur: z.number().nullable(),
  mobile_lines: z.number().nullable(),
  mobile_data_gb: z.number().nullable(),
  mobile_unlimited_data: z.boolean().nullable(),
  mobile_monthly_eur: z.number().nullable(),
  total_due: z.number().nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
});

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
  fixed_monthly_fee: num.describe("Πάγιο Τέλος της περιόδου, όπως αναγράφεται"),
  energy_charge_gross: num.describe("Χρέωση ενέργειας προμήθειας πριν από εκπτώσεις (kWh × τιμή)"),
  consistency_discount: num.describe("Έκπτωση συνέπειας/έγκαιρης πληρωμής σε €, θετικός αριθμός"),
  net_energy_charge: num.describe("energy_charge_gross μείον εκπτώσεις, ΧΩΡΙΣ το πάγιο"),
  supplier_total: num.describe("Σύνολο χρεώσεων προμήθειας του παρόχου (πάγιο + ενέργεια − εκπτώσεις), χωρίς ρυθμιζόμενες, φόρους, ΦΠΑ, δήμο"),
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

  if (bill.fixed_monthly_fee !== null && bill.net_energy_charge !== null && bill.supplier_total !== null &&
      Math.abs(bill.fixed_monthly_fee + bill.net_energy_charge - bill.supplier_total) > 0.5) {
    w.push("Οι χρεώσεις προμήθειας (πάγιο + ενέργεια) δεν συμφωνούν με το σύνολο προμήθειας. Έλεγξε τα ποσά.");
  }

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

function sourceBlock(file: { buffer: Buffer; mimeType: "application/pdf" | ImageType }): Anthropic.ContentBlockParam {
  const data = file.buffer.toString("base64");
  return file.mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: file.mimeType, data } };
}

export async function extractBill(file: { buffer: Buffer; mimeType: "application/pdf" | ImageType }, category: EnergyCategory = "electricity"): Promise<Bill> {
  const source = sourceBlock(file);

  // Haiku: cheapest tier, accurate enough for reading a bill. It has no server-side fallback on refusal.
  const res = await anthropic().messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 16000,
    system: category === "gas" ? GAS_PROMPT : ELECTRICITY_PROMPT,
    output_config: { effort: "medium", format: zodOutputFormat(BillSchema) },
    messages: [{ role: "user", content: [source, { type: "text", text: category === "gas" ? "Ανάλυσε αυτόν τον λογαριασμό φυσικού αερίου." : "Ανάλυσε αυτόν τον λογαριασμό ρεύματος." }] }],
  });

  if (res.stop_reason === "refusal") throw new Error("Το Billi δεν μπόρεσε να αναλύσει αυτό το αρχείο. Δοκίμασε άλλο αρχείο.");
  if (res.stop_reason === "max_tokens" || !res.parsed_output) throw new Error("Το Billi δεν κατάφερε να διαβάσει τον λογαριασμό. Δοκίμασε ξανά.");

  const bill = res.parsed_output;
  if (bill.consistency_discount !== null) bill.consistency_discount = Math.abs(bill.consistency_discount);
  return bill;
}

export async function extractTelecom(file: { buffer: Buffer; mimeType: "application/pdf" | ImageType }): Promise<TelecomBill> {
  const res = await anthropic().messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 16000,
    system: TELECOM_PROMPT,
    output_config: { effort: "medium", format: zodOutputFormat(TelecomSchema) },
    messages: [{ role: "user", content: [sourceBlock(file), { type: "text", text: "Ανάλυσε αυτόν τον λογαριασμό τηλεπικοινωνιών." }] }],
  });
  if (res.stop_reason === "refusal") throw new Error("Το Billi δεν μπόρεσε να αναλύσει αυτό το αρχείο. Δοκίμασε άλλο αρχείο.");
  if (res.stop_reason === "max_tokens" || !res.parsed_output) throw new Error("Το Billi δεν κατάφερε να διαβάσει τον λογαριασμό. Δοκίμασε ξανά.");
  return res.parsed_output;
}

export function validateTelecom(b: TelecomBill): string[] {
  const w: string[] = [];
  if (!b.provider) w.push("Δεν αναγνωρίστηκε πάροχος");
  if (!b.has_internet && !b.has_mobile) w.push("Δεν βρέθηκε internet ή κινητή στον λογαριασμό");
  if (b.has_internet && !b.internet_speed_mbps) w.push("Δεν βρέθηκε η ταχύτητα του internet: η σύγκριση δείχνει όλες τις ταχύτητες");
  if (b.has_internet && b.internet_monthly_eur === null) w.push("Δεν βρέθηκε το μηνιαίο κόστος του internet");
  if (b.has_mobile && b.mobile_monthly_eur === null) w.push("Δεν βρέθηκε το μηνιαίο κόστος της κινητής");
  return w;
}

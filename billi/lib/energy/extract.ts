import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { FetchedDoc } from "./fetch-source";

const VAT = 0.06;

const ExtractedTariff = z.object({
  provider: z.string(),
  name: z.string(),
  segment: z.enum(["residential", "business"]),
  color: z.enum(["blue", "green", "yellow", "orange"]).nullable(),
  fixed_monthly_eur: z.number().nullable(),
  price_per_kwh_eur: z.number().nullable(),
  day_night: z.boolean(),
  price_per_kwh_night_eur: z.number().nullable(),
  price_per_kwh_with_discount_eur: z.number().nullable(),
  discount_condition: z.string().nullable(),
  promo_discount: z.string().nullable(),
  min_duration_months: z.number().nullable(),
  early_termination_fee: z.string().nullable(),
  conditions: z.string().nullable(),
  valid_from: z.string().nullable(),
  valid_until: z.string().nullable(),
  valid_month: z.string().nullable(),
  prices_include_vat: z.boolean(),
  found_in: z.enum(["page", "document"]),
  document_url: z.string().nullable(),
  evidence: z.string(),
});
export type ExtractedTariff = z.infer<typeof ExtractedTariff>;

const Extraction = z.object({
  tariffs: z.array(ExtractedTariff),
  /** PDF price lists linked from the page that hold prices the page itself doesn't show */
  price_documents: z.array(z.string()),
  notes: z.string().nullable(),
});
export type Extraction = z.infer<typeof Extraction>;

const SYSTEM = `
Διαβάζεις επίσημα έγγραφα τιμολογίων ηλεκτρικής ενέργειας Ελλήνων προμηθευτών (σελίδες και PDF τιμοκαταλόγων)
και εξάγεις ΜΟΝΟ ό,τι γράφουν. Τα δεδομένα θα ελεγχθούν από διαχειριστή πριν δημοσιευτούν.

ΑΠΑΡΑΒΑΤΟΙ ΚΑΝΟΝΕΣ
1. Ποτέ μην μαντεύεις και ποτέ μη συμπληρώνεις από γνώση σου. Ό,τι δεν γράφει το έγγραφο → null.
2. Μόνο τιμολόγια ΡΕΥΜΑΤΟΣ (όχι φυσικού αερίου, όχι ρυθμιζόμενες χρεώσεις ΔΕΔΔΗΕ/ΑΔΜΗΕ, ΥΚΩ, ΕΤΜΕΑΡ, ΕΦΚ).
3. Κάθε πρόγραμμα μία φορά. Αν ένα πρόγραμμα έχει παραλλαγές (π.χ. μονοφασικό/τριφασικό με ίδια τιμή) γράψε το μία φορά.
4. evidence: αντέγραψε ΑΥΤΟΥΣΙΟ το κομμάτι κειμένου (έως 300 χαρακτήρες) από όπου πήρες τιμή και πάγιο.

ΠΕΔΙΑ
- provider: ο προμηθευτής όπως γράφεται. name: το όνομα του προγράμματος όπως το γράφει ο προμηθευτής.
- segment: "residential" για οικιακά, "business" για επαγγελματικά.
- color: χρώμα ΡΑΑΕΥ όπως αναγράφεται: Μπλε/σταθερό → "blue", Πράσινο/κυμαινόμενο που ανακοινώνεται την 1η του μήνα → "green",
  Κίτρινο/κυμαινόμενο βάσει χονδρεμπορικής → "yellow", Πορτοκαλί/δυναμικό → "orange". Αν δεν προκύπτει καθαρά → null.
- price_per_kwh_eur: τιμή ενέργειας προμήθειας σε €/kWh (ημερήσια αν έχει ημέρα/νύχτα), ΧΩΡΙΣ εκπτώσεις υπό όρους.
  Αν δίνεται σε λεπτά/kWh διαίρεσε με 100. Αν δίνεται σε €/MWh διαίρεσε με 1000.
- price_per_kwh_night_eur και day_night: μόνο αν το πρόγραμμα έχει χωριστή νυχτερινή τιμή.
- fixed_monthly_eur: πάγιο προμήθειας σε €/μήνα. Αν γράφει «ανά 4μηνο» ή «ανά ημέρα», μετάτρεψε σε μήνα μόνο αν η μετατροπή είναι ρητή.
- price_per_kwh_with_discount_eur + discount_condition: τιμή με έκπτωση συνέπειας / έγκαιρης εξόφλησης / e-bill, και ο όρος.
- promo_discount: προωθητικές εκπτώσεις (π.χ. «−20% τους 3 πρώτους μήνες»), αλλιώς null.
- min_duration_months: διάρκεια σύμβασης/δέσμευσης σε μήνες. early_termination_fee: η χρέωση πρόωρης λήξης όπως γράφεται.
- conditions: άλλοι σημαντικοί όροι (κλιμάκια kWh, απαίτηση έξυπνου μετρητή, εγγύηση) σε μία πρόταση.
- valid_from / valid_until: ημερομηνίες ισχύος σε ΕΕΕΕ-ΜΜ-ΗΗ, μόνο αν αναγράφονται. valid_month: ο μήνας τιμής (ΕΕΕΕ-ΜΜ) αν αναγράφεται.
- prices_include_vat: true αν οι τιμές που διάβασες περιλαμβάνουν ΦΠΑ. Γράψε τις τιμές όπως τις διάβασες.
- found_in: "page" αν η τιμή είναι στο κείμενο της σελίδας, "document" αν είναι σε PDF. document_url: το link του PDF, αλλιώς null.
- price_documents: links PDF τιμοκαταλόγων από τη λίστα συνδέσμων της σελίδας που περιέχουν τις τιμές
  οικιακών προγραμμάτων που ΔΕΝ φαίνονται στη σελίδα (έως 4). Αλλιώς κενή λίστα.
ΣΕΛΙΔΕΣ ΜΕ ΙΣΤΟΡΙΚΟ ΤΙΜΩΝ: αν η σελίδα δείχνει τιμές ανά μήνα, κράτα για κάθε πρόγραμμα ΜΟΝΟ τον πιο πρόσφατο μήνα
(και βάλε valid_month). Μην επιστρέφεις το ίδιο πρόγραμμα για παλιότερους μήνες.
ΠΡΟΓΡΑΜΜΑΤΑ ΜΕ ΚΛΙΜΑΚΙΑ (π.χ. «πρώτες 100 kWh»): price_per_kwh_eur = η τιμή του βασικού κλιμακίου όπως αναγράφεται, και
περιέγραψε τα κλιμάκια στο conditions.
Αν το έγγραφο δεν περιέχει τιμές ρεύματος, επίστρεψε κενή λίστα tariffs και εξήγησε στο notes.`;

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

const MAX_TEXT = 150_000;

function pageBlock(doc: FetchedDoc): Anthropic.TextBlockParam {
  const links = doc.pdfLinks.length ? `\n\nΣΥΝΔΕΣΜΟΙ PDF ΣΤΗ ΣΕΛΙΔΑ:\n${doc.pdfLinks.map((l) => `- ${l.label || "(χωρίς τίτλο)"}: ${l.url}`).join("\n")}` : "";
  return { type: "text", text: `ΣΕΛΙΔΑ: ${doc.url}\n\n${(doc.text ?? "").slice(0, MAX_TEXT)}${links}` };
}

const pdfBlock = (doc: FetchedDoc): Anthropic.ContentBlockParam => ({
  type: "document",
  source: { type: "base64", media_type: "application/pdf", data: doc.bytes.toString("base64") },
  title: doc.url,
});

async function run(content: Anthropic.ContentBlockParam[], hint: string): Promise<Extraction> {
  const res = await anthropic().messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(Extraction) },
    messages: [{ role: "user", content: [...content, { type: "text", text: hint }] }],
  });
  if (res.stop_reason === "refusal") throw new Error("Η ανάγνωση της πηγής απορρίφθηκε");
  if (res.stop_reason === "max_tokens" || !res.parsed_output) throw new Error("Η πηγή είναι πολύ μεγάλη ή δεν διαβάστηκε");
  return res.parsed_output;
}

/** One page (with its linked PDFs, if Claude asks for them through `fetchPdf`) or one PDF. */
export async function extractTariffs(
  doc: FetchedDoc,
  opts: { provider: string | null; fetchPdf: (url: string) => Promise<FetchedDoc | null> },
): Promise<{ extraction: Extraction; documents: FetchedDoc[] }> {
  const who = opts.provider ? `Ο προμηθευτής της πηγής είναι «${opts.provider}».` : "Η πηγή μπορεί να περιέχει πολλούς προμηθευτές.";
  if (doc.type === "pdf") {
    return { extraction: await run([pdfBlock(doc)], `${who} Εξάγαγε τα τιμολόγια ρεύματος αυτού του εγγράφου.`), documents: [] };
  }
  const first = await run([pageBlock(doc)], `${who} Εξάγαγε τα τιμολόγια ρεύματος της σελίδας.`);
  const wanted = [...new Set(first.price_documents)].filter((u) => doc.pdfLinks.some((l) => l.url === u)).slice(0, 4);
  if (wanted.length === 0) return { extraction: first, documents: [] };

  const documents: FetchedDoc[] = [];
  let total = 0;
  for (const u of wanted) {
    const pdf = await opts.fetchPdf(u);
    if (!pdf || pdf.type !== "pdf" || total + pdf.bytes.length > 15 * 1024 * 1024) continue;
    total += pdf.bytes.length;
    documents.push(pdf);
  }
  if (documents.length === 0) return { extraction: first, documents };
  const second = await run(
    [pageBlock(doc), ...documents.map(pdfBlock)],
    `${who} Εξάγαγε τα τιμολόγια ρεύματος από τη σελίδα ΚΑΙ τα συνημμένα PDF. Για κάθε τιμή από PDF βάλε found_in "document" και το document_url του.`,
  );
  return { extraction: second, documents };
}

/** Prices to € without VAT, rounded the way providers publish them. */
export function netOfVat(t: ExtractedTariff): ExtractedTariff {
  if (!t.prices_include_vat) return t;
  const n = (v: number | null, d: number) => (v === null ? null : Math.round((v / (1 + VAT)) * 10 ** d) / 10 ** d);
  return {
    ...t,
    fixed_monthly_eur: n(t.fixed_monthly_eur, 2),
    price_per_kwh_eur: n(t.price_per_kwh_eur, 5),
    price_per_kwh_night_eur: n(t.price_per_kwh_night_eur, 5),
    price_per_kwh_with_discount_eur: n(t.price_per_kwh_with_discount_eur, 5),
  };
}

/**
 * AI search: Claude looks the programmes up with web search (the search engine's public index, limited
 * to the provider's own site) and reports only prices it saw in the results, with the page of each.
 * Used for providers whose pages can't be read directly; everything is flagged for checking at the source.
 */
export async function searchTariffs(provider: { name: string; website: string | null }, segment: "residential" | "business" | "both"): Promise<Extraction> {
  const host = provider.website ? new URL(provider.website).hostname.replace(/^www\./, "") : null;
  const which = segment === "both" ? "οικιακά ΚΑΙ επαγγελματικά" : segment === "business" ? "επαγγελματικά" : "οικιακά";
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: "user",
    content: `Ψάξε με το web_search τα ΤΡΕΧΟΝΤΑ ${which} τιμολόγια ρεύματος του προμηθευτή «${provider.name}»` +
      `${host ? ` στο επίσημο site του (${host})` : ""}: όλα τα προγράμματα (μπλε, πράσινα, κίτρινα, πορτοκαλί). ` +
      `Κάνε όσες αναζητήσεις χρειάζεται (π.χ. ανά χρώμα ή ανά όνομα προγράμματος). ` +
      `Για κάθε πρόγραμμα: found_in "document", document_url = η σελίδα του αποτελέσματος όπου είδες την τιμή, ` +
      `evidence = το απόσπασμα του αποτελέσματος. Αν μια τιμή δεν φαίνεται στα αποτελέσματα, βάλε null: μη συμπληρώνεις από μνήμη.`,
  }];
  for (let i = 0; i < 4; i++) {
    const res = await anthropic().beta.messages.parse({
      model: "claude-haiku-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8, ...(host ? { allowed_domains: [host] } : {}) }],
      output_config: { effort: "medium", format: betaZodOutputFormat(Extraction) },
      messages,
    });
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "refusal") throw new Error("Η αναζήτηση απορρίφθηκε");
    if (!res.parsed_output) throw new Error("Η αναζήτηση δεν επέστρεψε αποτελέσματα");
    return res.parsed_output;
  }
  throw new Error("Η αναζήτηση δεν ολοκληρώθηκε");
}

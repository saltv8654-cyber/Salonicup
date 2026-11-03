import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Tariff, TariffFile } from "./types";

/** Residential electricity suppliers to research. `site` is a search hint, not a hard restriction. */
export const PROVIDERS: { name: string; site: string }[] = [
  { name: "ΔΕΗ", site: "dei.gr" },
  { name: "Protergia", site: "protergia.gr" },
  { name: "ΗΡΩΝ", site: "heron.gr" },
  { name: "Elpedison", site: "elpedison.gr" },
  { name: "NRG", site: "nrg.gr" },
  { name: "ZeniΘ", site: "zenith.gr" },
  { name: "Watt+Volt", site: "watt-volt.gr" },
  { name: "Φυσικό Αέριο Ελλάδος", site: "fysikoaerioellados.gr" },
  { name: "Volton", site: "volton.gr" },
];

const ProviderTariffs = z.object({
  tariffs: z.array(
    z.object({
      name: z.string(),
      color: z.enum(["blue", "green", "yellow", "orange"]),
      fixed_monthly_eur: z.number(),
      price_per_kwh_eur: z.number(),
      price_per_kwh_with_discount_eur: z.number().nullable(),
      discount_condition: z.string().nullable(),
      min_duration_months: z.number().nullable(),
      url: z.string().nullable(),
    }),
  ),
});

function prompt(provider: { name: string; site: string }, month: string) {
  return `Βρες τα τρέχοντα ΟΙΚΙΑΚΑ τιμολόγια ηλεκτρικής ενέργειας (χαμηλή τάση, μονοφασικό/τριφασικό, χωρίς νυχτερινό)
του παρόχου «${provider.name}» στην Ελλάδα για τον μήνα ${month}.

Πού να ψάξεις: το επίσημο site του παρόχου (${provider.site}), τη σελίδα με τα τιμολόγια του μήνα που υποχρεούται να
δημοσιεύει, ή το energycost.gr / raaey.gr. Προτίμησε τις επίσημες πηγές από ειδησεογραφικά sites.

Για κάθε πρόγραμμα δώσε:
- name: όνομα προγράμματος όπως το γράφει ο πάροχος
- color: το χρώμα ΡΑΑΕΥ (blue = σταθερό, green = κυμαινόμενο που ανακοινώνεται την 1η του μήνα,
  yellow = κυμαινόμενο βάσει χονδρεμπορικής, orange = δυναμικό)
- fixed_monthly_eur: πάγιο σε €/μήνα χωρίς ΦΠΑ
- price_per_kwh_eur: τιμή ενέργειας προμήθειας σε €/kWh χωρίς ΦΠΑ, ΧΩΡΙΣ εκπτώσεις υπό όρους
- price_per_kwh_with_discount_eur: η τιμή με την έκπτωση υπό όρους (π.χ. έγκαιρη πληρωμή), αλλιώς null
- discount_condition: σύντομη περιγραφή του όρου, αλλιώς null
- min_duration_months: διάρκεια δέσμευσης σε μήνες, αλλιώς null
- url: η σελίδα όπου βρήκες την τιμή

Κανόνες:
- Μόνο τιμές που είδες σε σελίδα. Αν δεν βρεις αξιόπιστη τιμή για ένα πρόγραμμα, παράλειψέ το.
- Μόνο προγράμματα για νέους οικιακούς πελάτες που ισχύουν τώρα.
- Για κίτρινα τιμολόγια δώσε την τελευταία δημοσιευμένη τιμή.
- Αν οι τιμές δίνονται σε λεπτά, μετάτρεψέ τες σε €.
- Αν δεν βρεις τίποτα, επίστρεψε κενή λίστα.`;
}

/** Drops values that can't be a residential tariff, so one bad extraction can't skew the comparison. */
function plausible(t: Omit<Tariff, "id" | "category" | "provider" | "valid_month">): boolean {
  const priceOk = (p: number) => p >= 0.03 && p <= 0.6;
  return (
    t.name.trim().length > 0 &&
    t.fixed_monthly_eur >= 0 && t.fixed_monthly_eur <= 30 &&
    priceOk(t.price_per_kwh_eur) &&
    (t.price_per_kwh_with_discount_eur === undefined ||
      (priceOk(t.price_per_kwh_with_discount_eur) && t.price_per_kwh_with_discount_eur <= t.price_per_kwh_eur))
  );
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9Ͱ-Ͽ]+/g, "-").replace(/^-|-$/g, "");

async function researchProvider(client: Anthropic, provider: { name: string; site: string }, month: string): Promise<Tariff[]> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt(provider, month) }];

  // Server-side web tools can pause a long turn; resend to let it continue (bounded).
  for (let i = 0; i < 4; i++) {
    const res = await client.beta.messages.parse({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ProviderTariffs) },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 4 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
      ],
      messages,
    });

    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "refusal") throw new Error("refusal");
    if (!res.parsed_output) throw new Error(`no data (stop_reason: ${res.stop_reason})`);

    return res.parsed_output.tariffs
      .map((t) => ({
        name: t.name.trim(),
        color: t.color,
        fixed_monthly_eur: t.fixed_monthly_eur,
        price_per_kwh_eur: t.price_per_kwh_eur,
        price_per_kwh_with_discount_eur: t.price_per_kwh_with_discount_eur ?? undefined,
        discount_condition: t.discount_condition ?? undefined,
        min_duration_months: t.min_duration_months ?? undefined,
        url: t.url ?? undefined,
      }))
      .filter(plausible)
      .map((t) => ({
        ...t,
        id: `${slug(provider.name)}-${slug(t.name)}`,
        category: "electricity" as const,
        provider: provider.name,
        valid_month: month,
      }));
  }
  throw new Error("too many pauses");
}

/**
 * Researches every provider in parallel. A provider that fails keeps its tariffs from the previous
 * snapshot, so a flaky site never empties the comparison.
 */
export async function syncTariffs(previous: TariffFile): Promise<TariffFile & { errors: Record<string, string> }> {
  const client = new Anthropic();
  const month = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" }).slice(0, 7);
  const errors: Record<string, string> = {};

  const results = await Promise.all(
    PROVIDERS.map(async (p) => {
      try {
        const found = await researchProvider(client, p, month);
        if (found.length > 0) return found;
        errors[p.name] = "δεν βρέθηκαν τιμές";
      } catch (e: any) {
        errors[p.name] = e?.message ?? String(e);
      }
      return previous.tariffs.filter((t) => t.provider === p.name);
    }),
  );

  // Same programme listed twice (e.g. two pages) → keep one.
  const byId = new Map<string, Tariff>();
  for (const t of results.flat()) byId.set(t.id, t);

  return {
    updated_at: new Date().toISOString(),
    source: "Αυτόματη έρευνα στα sites των παρόχων, energycost.gr και raaey.gr",
    tariffs: [...byId.values()],
    errors,
  };
}

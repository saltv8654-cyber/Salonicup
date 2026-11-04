import { db } from "@/lib/db";
import { searchTariffs } from "@/lib/energy/extract";
import { adminRoute, json, must } from "@/lib/energy/http";
import type { Provider, Source } from "@/lib/energy/model";
import { runSource } from "@/lib/energy/run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** AI search for one provider's programmes ({ provider_id, segment }); results wait for approval. */
export const POST = adminRoute(async (req, admin) => {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "Λείπει το ANTHROPIC_API_KEY στο Vercel" }, 500);
  const body = await req.json().catch(() => ({}));
  const segment = ["residential", "business", "both"].includes(body.segment) ? body.segment : "both";
  if (typeof body.provider_id !== "string") return json({ error: "Διάλεξε πάροχο" }, 400);
  const provider = must(await db().from("energy_providers").select("*").eq("id", body.provider_id).maybeSingle()) as Provider | null;
  if (!provider) return json({ error: "Ο πάροχος δεν βρέθηκε" }, 404);

  // One hidden source per provider keeps the AI-search runs and proposals together.
  const url = `search:${provider.slug}`;
  let source = must(await db().from("tariff_data_sources").select("*").eq("url", url).maybeSingle()) as Source | null;
  if (!source) {
    source = must(await db().from("tariff_data_sources").insert({
      provider_id: provider.id, label: `🔎 Αναζήτηση AI`, url, kind: "auto", segment, enabled: false,
      notes: "Αποτελέσματα αναζήτησης στο web· κάθε τιμή ελέγχεται στη σελίδα του παρόχου πριν την έγκριση.",
    }).select().single()) as Source;
  }
  const extraction = await searchTariffs({ name: provider.name, website: provider.website }, segment);
  const result = await runSource({ ...source, segment }, "manual", admin, undefined, extraction);
  return json({ result });
});

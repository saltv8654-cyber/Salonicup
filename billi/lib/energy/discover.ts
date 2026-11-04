import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db } from "../db";
import { fetchDocument, htmlToText, sourceUrlAllowed } from "./fetch-source";
import type { Source } from "./model";

/**
 * A "site" source is just a provider's address (e.g. dei.gr). Discovery finds that site's price pages
 * (sitemap + links from the home page and its main sections), lets Claude pick the ones that publish
 * current electricity tariffs, and adds them as ordinary sources. Their prices then go through the
 * usual extraction, validation and approval.
 */

const MAX_CANDIDATES = 120;
const MAX_PICK = 15;

/** "dei.gr", "www.dei.gr/el" or a full link → https URL. */
export function normaliseSiteUrl(raw: string): string {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
}

const rootDomain = (host: string) => host.replace(/^www\./, "").split(".").slice(-2).join(".");
const canon = (u: string) => {
  const x = new URL(u);
  x.hash = "";
  for (const k of [...x.searchParams.keys()]) if (/^(utm_|gclid|fbclid|_gl)/i.test(k)) x.searchParams.delete(k);
  return x.toString().replace(/\/$/, "");
};

const SKIP = /\.(jpe?g|png|gif|webp|svg|ico|css|js|mp4|zip|docx?|xlsx?)(\?|$)|mailto:|tel:|javascript:|\/(login|signin|register|cart|search|careers?|jobs|press|news|blog|arthra|newsroom|contact|privacy|cookies?)(\/|$)/i;
const GOOD = /τιμολ|τιμοκατ|τιμ(ές|ων)|χρε(ώ|ω)σ|πρ(ό|ο)γραμμ|οικιακ|σπίτι|ρε(ύ|υ)μα|ηλεκτρ|μπλε|πρ(ά|α)σιν|κ(ί|ι)τριν|πορτοκαλ|tariff|pric|electric|power|home|fixed|myhome|g1|blue|green|yellow|orange|business|επιχε(ί|ι)ρ|επαγγελ/i;
const GAS = /αέριο|aerio|\bgas\b/i;

export function linksOf(html: string, base: string): { url: string; label: string }[] {
  const host = rootDomain(new URL(base).hostname);
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"), base);
      if (!/^https?:$/.test(u.protocol) || rootDomain(u.hostname) !== host || SKIP.test(u.href)) continue;
      const c = canon(u.href);
      if (!out.has(c)) out.set(c, htmlToText(m[2]).replace(/\s+/g, " ").slice(0, 120));
    } catch {
      /* not a URL */
    }
  }
  return [...out].map(([url, label]) => ({ url, label }));
}

async function sitemapUrls(origin: string): Promise<string[]> {
  const found: string[] = [];
  const queue = [`${origin}/sitemap.xml`];
  for (let i = 0; i < queue.length && i < 4; i++) {
    try {
      const res = await fetch(queue[i], { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "BilliTariffBot/1.0 (+https://bill-i.vercel.app)" } });
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
      if (/<sitemapindex/i.test(xml)) queue.push(...locs.filter((l) => /electric|reuma|ρεύμα|home|product|page|el/i.test(l)).slice(0, 3));
      else found.push(...locs);
    } catch {
      /* no sitemap */
    }
  }
  return found.slice(0, 3000);
}

const score = (c: { url: string; label: string }) => {
  const s = `${decodeURIComponent(c.url)} ${c.label}`;
  let n = (s.match(new RegExp(GOOD.source, "gi")) ?? []).length;
  if (/\.pdf(\?|$)/i.test(c.url)) n += 1;
  if (GAS.test(s)) n -= 2; // gas pages are out of scope here
  return n;
};

const Pick = z.object({
  pages: z.array(z.object({ url: z.string(), segment: z.enum(["residential", "business"]), title: z.string() })),
  notes: z.string().nullable(),
});

let client: Anthropic | null = null;

export interface DiscoveryResult { found: number; added: number; message: string }

export async function discover(source: Source, providerName: string | null): Promise<DiscoveryResult> {
  const home = await fetchDocument(source.url, "html");
  const origin = new URL(home.url).origin;
  const html = home.bytes.toString("utf8");

  // Links on the home page, then on its most promising sections (product pages are often one level down).
  const candidates = new Map<string, string>();
  const add = (list: { url: string; label: string }[]) => list.forEach((l) => !candidates.has(l.url) && candidates.set(l.url, l.label));
  add(linksOf(html, home.url));
  const sections = [...candidates].map(([url, label]) => ({ url, label })).filter((c) => !/\.pdf/i.test(c.url)).sort((a, b) => score(b) - score(a)).slice(0, 6);
  await Promise.all(sections.map(async (s) => {
    try {
      const d = await fetchDocument(s.url, "html");
      add(linksOf(d.bytes.toString("utf8"), d.url));
    } catch {
      /* skip */
    }
  }));
  add((await sitemapUrls(origin)).map((u) => ({ url: canon(u), label: "" })));

  const ranked = [...candidates].map(([url, label]) => ({ url, label })).filter((c) => sourceUrlAllowed(c.url) && score(c) > 0)
    .sort((a, b) => score(b) - score(a)).slice(0, MAX_CANDIDATES);
  if (ranked.length === 0) throw new Error("Δεν βρέθηκαν σελίδες τιμολογίων στο site");

  const wanted = source.segment === "both" ? "οικιακά ΚΑΙ επαγγελματικά" : source.segment === "business" ? "επαγγελματικά" : "οικιακά";
  const res = await (client ??= new Anthropic()).messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 8000,
    system:
      "Διαλέγεις, από τη λίστα συνδέσμων ενός site προμηθευτή ενέργειας, τις σελίδες ή τα PDF που δημοσιεύουν ΤΡΕΧΟΥΣΕΣ τιμές " +
      "τιμολογίων ΡΕΥΜΑΤΟΣ (τιμή €/kWh, πάγιο). Προτίμησε: σελίδες με όλες τις τιμές μαζί (τιμοκατάλογοι, «χρεώσεις», «ιστορικό τιμών»), " +
      "και σελίδες μεμονωμένων προγραμμάτων. Όχι: φυσικό αέριο, ειδήσεις, γενικές πληροφορίες, παλιά PDF προηγούμενων ετών. " +
      "Επίστρεψε ΜΟΝΟ links από τη λίστα, αυτούσια. segment = residential για οικιακά, business για επαγγελματικά.",
    output_config: { effort: "low", format: zodOutputFormat(Pick) },
    messages: [{
      role: "user",
      content: `Προμηθευτής: ${providerName ?? new URL(origin).hostname}. Θέλω τα ${wanted} τιμολόγια ρεύματος (έως ${MAX_PICK} σελίδες).\n\n` +
        ranked.map((c) => `- ${c.url}${c.label ? ` (${c.label})` : ""}`).join("\n"),
    }],
  });
  if (!res.parsed_output) throw new Error("Η επιλογή σελίδων απέτυχε");
  const allowed = new Set(ranked.map((c) => c.url));
  const picked = res.parsed_output.pages
    .map((p) => ({ ...p, url: canon(p.url) }))
    .filter((p) => allowed.has(p.url) && (source.segment === "both" || p.segment === source.segment))
    .slice(0, MAX_PICK);

  const { data: existing } = await db().from("tariff_data_sources").select("url");
  const known = new Set(((existing ?? []) as { url: string }[]).map((s) => canon(s.url)));
  const rows = picked.filter((p) => !known.has(p.url)).map((p) => ({
    provider_id: source.provider_id,
    label: `${providerName ?? new URL(origin).hostname} · ${p.title.slice(0, 120)}`,
    url: p.url,
    kind: /\.pdf(\?|$)/i.test(p.url) ? "pdf" : "auto",
    segment: p.segment,
    enabled: true,
    check_every_hours: source.check_every_hours >= 24 ? 24 : source.check_every_hours,
    discovered_from: source.id,
  }));
  if (rows.length) {
    const { error } = await db().from("tariff_data_sources").insert(rows);
    if (error) throw new Error(error.message);
  }
  return {
    found: picked.length,
    added: rows.length,
    message: picked.length
      ? `Βρέθηκαν ${picked.length} σελίδες τιμών${rows.length ? `, ${rows.length} νέες προστέθηκαν ως πηγές` : " (υπήρχαν ήδη)"}`
      : `Δεν βρέθηκαν σελίδες με τιμές ρεύματος${res.parsed_output.notes ? `: ${res.parsed_output.notes}` : ""}`,
  };
}

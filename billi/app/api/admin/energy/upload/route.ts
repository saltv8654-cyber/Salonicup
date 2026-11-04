import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { htmlToText, pdfLinksOf, sha256, sourceUrlAllowed, type FetchedDoc } from "@/lib/energy/fetch-source";
import { adminRoute, json, must } from "@/lib/energy/http";
import type { Source } from "@/lib/energy/model";
import { runSource } from "@/lib/energy/run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX = 4 * 1024 * 1024; // Vercel request body limit is ~4.5 MB

/**
 * A price list the administrator downloaded from the provider's site (PDF, or a page saved as HTML), for
 * sites that don't allow automatic reading. It goes through the same extraction, checks and approval.
 */
export const POST = adminRoute(async (req, admin) => {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "Λείπει το ANTHROPIC_API_KEY στο Vercel" }, 500);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return json({ error: "Διάλεξε αρχείο" }, 400);
  if (file.size > MAX) return json({ error: "Το αρχείο είναι πάνω από 4 MB" }, 400);
  const providerId = String(form?.get("provider_id") ?? "") || null;
  const segment = ["residential", "business", "both"].includes(String(form?.get("segment"))) ? String(form?.get("segment")) : "both";
  const pageUrl = String(form?.get("page_url") ?? "").trim();
  if (pageUrl && !sourceUrlAllowed(pageUrl)) return json({ error: "Η σελίδα προέλευσης πρέπει να είναι link https" }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  const isHtml = !isPdf && /<html|<body|<table/i.test(bytes.subarray(0, 20000).toString("utf8"));
  if (!isPdf && !isHtml) return json({ error: "Μόνο PDF ή σελίδα αποθηκευμένη ως HTML" }, 400);

  // Reuse the source of that page if there is one, so the programmes stay linked to it.
  let source: Source | null = null;
  if (pageUrl) {
    source = must(await db().from("tariff_data_sources").select("*").eq("url", pageUrl).maybeSingle()) as Source | null;
  }
  if (!source) {
    source = must(await db().from("tariff_data_sources").insert({
      provider_id: providerId, label: `📄 ${file.name.slice(0, 120)}`, url: pageUrl || `upload:${randomUUID()}`,
      kind: isPdf ? "pdf" : "html", segment, enabled: false, notes: `Ανέβηκε από ${admin}`,
    }).select().single()) as Source;
  }

  const html = isHtml ? bytes.toString("utf8") : "";
  const docUrl = pageUrl || source.url;
  const doc: FetchedDoc = isPdf
    ? { url: docUrl, type: "pdf", bytes, text: null, pdfLinks: [], hash: sha256(bytes) }
    : { url: docUrl, type: "html", bytes, text: htmlToText(html), pdfLinks: pageUrl ? pdfLinksOf(html, pageUrl) : [], hash: sha256(Buffer.from(htmlToText(html))) };

  const result = await runSource({ ...source, last_hash: null, segment: source.segment ?? (segment as Source["segment"]) }, "manual", admin, doc);
  return json({ result, source_id: source.id });
});

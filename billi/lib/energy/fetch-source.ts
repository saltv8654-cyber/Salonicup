import { createHash } from "crypto";
import { db } from "../db";

const BUCKET = "tariff-sources";
const MAX_BYTES = 15 * 1024 * 1024;
const UA = "BilliTariffBot/1.0 (+https://bill-i.vercel.app; reads published electricity tariffs)"; // headers must be ASCII

export interface FetchedDoc {
  url: string;
  type: "html" | "pdf";
  bytes: Buffer;
  /** readable text for HTML pages (tables kept as "a | b | c" lines) */
  text: string | null;
  /** links to PDF price lists found on an HTML page */
  pdfLinks: { url: string; label: string }[];
  hash: string;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", ndash: "–", mdash: "—", middot: "·", deg: "°" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Plain text of a page, keeping table rows on one line so prices stay next to their labels. */
export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(tr|p|div|li|h[1-6]|section|article|table|ul|ol|dt|dd)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pdfLinksOf(html: string, base: string): { url: string; label: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[1]);
    if (!/\.pdf(\?|#|$)/i.test(href)) continue;
    try {
      const u = new URL(href, base).toString();
      if (!out.has(u)) out.set(u, htmlToText(m[2]).replace(/\s+/g, " ").slice(0, 160));
    } catch {
      /* not a URL */
    }
  }
  return [...out].map(([url, label]) => ({ url, label })).slice(0, 60);
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f:]*\]?)$/i;

/** Public https pages only. ENERGY_ALLOW_LOCAL_SOURCES=1 lets local tests use http://localhost. */
export function sourceUrlAllowed(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (process.env.ENERGY_ALLOW_LOCAL_SOURCES === "1" && ["localhost", "127.0.0.1"].includes(u.hostname)) return true;
    return u.protocol === "https:" && !PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export async function fetchDocument(url: string, expect: "auto" | "html" | "pdf" = "auto"): Promise<FetchedDoc> {
  if (!sourceUrlAllowed(url)) throw new Error("Επιτρέπονται μόνο links https");
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/pdf;q=0.9,*/*;q=0.5", "accept-language": "el-GR,el;q=0.9,en;q=0.5" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch((e: unknown) => {
    const err = e as { name?: string; cause?: { code?: string } };
    if (err.name === "TimeoutError") throw new Error("Η πηγή δεν απάντησε σε 30 δευτερόλεπτα");
    throw new Error(`Δεν ήταν δυνατή η σύνδεση με την πηγή${err.cause?.code ? ` (${err.cause.code})` : ""}`);
  });
  if (res.url && !sourceUrlAllowed(res.url)) throw new Error("Η πηγή ανακατευθύνει σε μη επιτρεπτή διεύθυνση");
  if (!res.ok) throw new Error(`Η πηγή απάντησε ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("Το αρχείο είναι πάνω από 15 MB");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("Το αρχείο είναι πάνω από 15 MB");
  if (bytes.length === 0) throw new Error("Η πηγή επέστρεψε κενή σελίδα");

  const ctype = res.headers.get("content-type") ?? "";
  const isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-" || /application\/pdf/i.test(ctype);
  if (expect === "pdf" && !isPdf) throw new Error("Περιμέναμε PDF αλλά η πηγή επέστρεψε σελίδα");
  if (isPdf) return { url: res.url || url, type: "pdf", bytes, text: null, pdfLinks: [], hash: sha256(bytes) };

  const html = bytes.toString("utf8");
  const text = htmlToText(html);
  if (text.length < 40) throw new Error("Η σελίδα δεν έχει κείμενο (ίσως φορτώνει τις τιμές με JavaScript)");
  // Hash the readable text, not the HTML: tracking scripts and tokens change on every request.
  return { url: res.url || url, type: "html", bytes, text, pdfLinks: pdfLinksOf(html, res.url || url), hash: sha256(Buffer.from(text)) };
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function ensureBucket() {
  const { error } = await db().storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
}

/** Keeps a copy of what the price was read from. Same content → same path, stored once. */
export async function storeDocument(doc: FetchedDoc, folder: string): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10);
  const path = `${folder}/${day}-${doc.hash.slice(0, 16)}.${doc.type}`;
  const type = doc.type === "pdf" ? "application/pdf" : "text/html; charset=utf-8";
  const put = () => db().storage.from(BUCKET).upload(path, doc.bytes, { contentType: type, upsert: true });
  try {
    let { error } = await put();
    if (error && /bucket.*not.*found|not found/i.test(error.message)) {
      await ensureBucket();
      ({ error } = await put());
    }
    if (error) throw new Error(error.message);
    return path;
  } catch (e) {
    console.error("storeDocument:", e);
    return null;
  }
}

export async function documentUrl(path: string, seconds = 300): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(error?.message ?? "signed url failed");
  return data.signedUrl;
}

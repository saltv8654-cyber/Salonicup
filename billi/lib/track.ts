import { analyticsAllowed } from "./consent";

/** Funnel events we record. Anything else is ignored so the table can't be filled with junk. */
export const EVENT_NAMES = ["page_view", "upload_start", "analysis_ok", "analysis_error", "tariff_click", "lead_open", "lead_submit", "contact_click"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

const SID_KEY = "billi_sid";
const SRC_KEY = "billi_src";

/** Anonymous per-browser id, kept in localStorage (not a cookie), so funnel steps can be joined. Only with consent. */
export function sessionId(): string {
  if (!analyticsAllowed()) return "";
  try {
    let id = localStorage.getItem(SID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

/** First-touch traffic source: UTM tags, referrer and landing page, recorded once per browser. */
export function trafficSource(): Record<string, string> {
  try {
    const saved = localStorage.getItem(SRC_KEY);
    if (saved) return JSON.parse(saved);
    const q = new URLSearchParams(location.search);
    const src: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"]) {
      const v = q.get(k);
      if (v) src[k] = v.slice(0, 200);
    }
    if (document.referrer && !document.referrer.startsWith(location.origin)) src.referrer = document.referrer.slice(0, 300);
    src.landing = location.pathname + location.search.slice(0, 200);
    src.first_seen = new Date().toISOString();
    // Remembered across visits only with consent; otherwise it is just this visit's source.
    if (analyticsAllowed()) localStorage.setItem(SRC_KEY, JSON.stringify(src));
    return src;
  } catch {
    return {};
  }
}

export function track(name: EventName, props?: Record<string, string | number | boolean | null>) {
  if (!analyticsAllowed()) return;
  try {
    const body = JSON.stringify({ name, props, path: location.pathname, source: trafficSource(), session_id: sessionId() });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    // tracking must never break the page
  }
}

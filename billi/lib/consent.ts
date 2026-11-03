/** Visitor's cookie / tracking choice, kept in localStorage. Nothing optional runs until it says yes. */
export interface Consent {
  analytics: boolean;
  marketing: boolean;
  at: string;
  v: 1;
}

const KEY = "billi_consent";
export const CONSENT_EVENT = "billi-consent";
export const OPEN_SETTINGS_EVENT = "billi-open-cookie-settings";

export function getConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY);
    const c = raw ? (JSON.parse(raw) as Consent) : null;
    return c && c.v === 1 ? c : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: { analytics: boolean; marketing: boolean }) {
  const c: Consent = { ...choice, at: new Date().toISOString(), v: 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    // Withdrawing consent also removes what we stored under it.
    if (!c.analytics) ["billi_sid", "billi_src"].forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage blocked: the choice still applies to this page view
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: c }));
  return c;
}

export const analyticsAllowed = () => getConsent()?.analytics === true;

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

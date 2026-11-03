"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { CONSENT_EVENT, OPEN_SETTINGS_EVENT, getConsent, setConsent, type Consent } from "@/lib/consent";
import { track } from "@/lib/track";

function useConsent() {
  const [consent, setState] = useState<Consent | null | undefined>(undefined); // undefined = not read yet
  useEffect(() => {
    setState(getConsent());
    const on = (e: Event) => setState((e as CustomEvent<Consent>).detail);
    window.addEventListener(CONSENT_EVENT, on);
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, []);
  return consent;
}

/** Vercel Web Analytics, loaded only after the visitor accepts statistics. */
export function ConsentedAnalytics() {
  const consent = useConsent();
  return consent?.analytics ? <Analytics /> : null;
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-gradient-to-r from-cyan-400 to-violet-500" : "bg-white/15"} ${disabled ? "opacity-60" : ""}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const btnPrimary = "rounded-xl bg-gradient-to-r from-blue-500 via-cyan-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110";
const btnSecondary = "rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-white/10";

export function CookieBanner() {
  const consent = useConsent();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const show = () => {
      const c = getConsent();
      setAnalytics(c?.analytics ?? false);
      setMarketing(c?.marketing ?? false);
      setDetails(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, show);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, show);
  }, []);

  if (pathname?.startsWith("/admin")) return null;
  if (consent === undefined) return null;
  if (consent !== null && !open) return null;

  const save = (choice: { analytics: boolean; marketing: boolean }) => {
    const hadAnalytics = getConsent()?.analytics === true;
    setConsent(choice);
    setOpen(false);
    setDetails(false);
    // The page view happened before consent; count it once now that we may.
    if (choice.analytics && !hadAnalytics) track("page_view");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4" role="dialog" aria-modal="false" aria-label="Ρυθμίσεις cookies">
      <div className="mx-auto max-w-2xl rounded-2xl bg-[#0a1028]/95 p-4 shadow-2xl shadow-black/60 ring-1 ring-white/15 backdrop-blur-md sm:p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🍪</span>
          <div className="min-w-0">
            <div className="font-semibold text-white">Cookies και στατιστικά</div>
            <p className="mt-1 text-sm text-slate-300">
              Χρησιμοποιούμε τα απαραίτητα για να λειτουργεί το site. Με τη συγκατάθεσή σου, μετράμε ανώνυμα πώς
              χρησιμοποιείται για να το βελτιώνουμε. Δες την <a href="/privacy" className="underline">Πολιτική Απορρήτου</a>.
            </p>
          </div>
        </div>

        {details && (
          <div className="mt-4 space-y-2">
            {[
              { title: "Απαραίτητα", text: "Για να λειτουργεί το site και να θυμάται την επιλογή σου. Πάντα ενεργά.", on: true, disabled: true },
              { title: "Στατιστικά", text: "Ανώνυμη μέτρηση επισκέψεων, από πού ήρθες και ποια βήματα έκανες (Billi, Vercel Analytics).", on: analytics, set: setAnalytics },
              { title: "Marketing", text: "Μέτρηση διαφημίσεων σε Facebook/Instagram/Google, αν και όταν χρησιμοποιηθούν.", on: marketing, set: setMarketing },
            ].map((c) => (
              <div key={c.title} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{c.title}</div>
                  <div className="text-xs text-slate-400">{c.text}</div>
                </div>
                <Toggle on={c.on} disabled={c.disabled} onChange={c.set} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {details ? (
            <button type="button" className={`${btnSecondary} sm:col-span-1`} onClick={() => save({ analytics, marketing })}>Αποθήκευση επιλογών</button>
          ) : (
            <button type="button" className={btnSecondary} onClick={() => setDetails(true)}>Ρυθμίσεις</button>
          )}
          {/* Reject is styled exactly like Accept: the Greek DPA requires refusing to be as easy and visible as accepting. */}
          <button type="button" className={btnPrimary} onClick={() => save({ analytics: false, marketing: false })}>Απόρριψη</button>
          <button type="button" className={btnPrimary} onClick={() => save({ analytics: true, marketing: true })}>Αποδοχή όλων</button>
        </div>
      </div>
    </div>
  );
}

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className ?? "underline"} onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>
      Ρυθμίσεις cookies
    </button>
  );
}

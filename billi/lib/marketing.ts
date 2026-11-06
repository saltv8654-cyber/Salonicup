import { nextBestOffer, type NextOffer } from "./crm";
import type { CrmLead } from "./crm-data";
import { db } from "./db";
import { signToken, siteUrl } from "./mailer";
import { sourceLabel } from "./stats";
import type { Tariff } from "./types";

/** The wording people agree to; stored with every consent record. */
export const CONSENT_TEXT = {
  contact: { version: "lead-form-2026-11", text: "Συμφωνώ να επικοινωνήσει μαζί μου το Billi για την αλλαγή παρόχου, σύμφωνα με την Πολιτική Απορρήτου." },
  marketing: {
    version: "marketing-2026-11",
    text: "Θέλω να λαμβάνω εξατομικευμένες προσφορές (email, Viber ή WhatsApp) όταν βγαίνουν φθηνότερα προγράμματα για την κατανάλωσή μου. Μπορώ να διαγραφώ οποτεδήποτε.",
  },
} as const;

export async function recordConsent(r: { lead_id?: string | null; user_id?: string | null; purpose: "contact" | "marketing"; granted: boolean; source: string; actor?: string | null }) {
  try {
    const { error } = await db().from("consent_records").insert({ ...r, text_version: r.purpose === "contact" ? CONSENT_TEXT.contact.version : CONSENT_TEXT.marketing.version });
    if (error && !/does not exist|Could not find the table/i.test(error.message)) console.error("recordConsent:", error.message);
  } catch (e) {
    console.error("recordConsent:", e);
  }
}

export const unsubscribeLink = (leadId: string) => `${siteUrl()}/api/unsubscribe?t=${encodeURIComponent(signToken("unsub", leadId, 24 * 365 * 3))}`;

const OPEN = ["new", "contacted", "evaluation", "offer"];
const days = (iso: string | null | undefined) => (iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Infinity);
const billOf = (l: CrmLead) => (l.bill ?? {}) as Record<string, unknown>;

export interface Segment { key: string; icon: string; label: string; description: string; match: (l: CrmLead) => boolean }

/** Ready-made groups for targeted offers. Every campaign is further limited to people who consented. */
export const SEGMENTS: Segment[] = [
  { key: "contract_60", icon: "📄", label: "Λήξη σύμβασης σε 60 ημέρες", description: "Η σύμβασή τους λήγει σύντομα ή έληξε: η καλύτερη στιγμή για αλλαγή.",
    match: (l) => { const e = l.profile?.contract_end; if (!e) return false; const d = (Date.parse(`${e}T00:00:00Z`) - Date.now()) / 86_400_000; return d <= 60 && d >= -90; } },
  { key: "high_savings", icon: "💶", label: "Εξοικονόμηση πάνω από 100 €", description: "Ανοιχτά αιτήματα με μεγάλη εκτιμώμενη εξοικονόμηση.",
    match: (l) => OPEN.includes(l.status) && Number(l.savings ?? 0) >= 100 },
  { key: "hot", icon: "🔥", label: "Ζεστοί πελάτες", description: "Βαθμός 60+ (εξοικονόμηση, πρόσφατη δραστηριότητα, λογαριασμός).", match: (l) => l.crm.label === "hot" },
  { key: "variable_high", icon: "🟡", label: "Κυμαινόμενο με υψηλή κατανάλωση", description: "Κίτρινο/πράσινο τιμολόγιο και πάνω από 4.000 kWh/έτος: τους ενδιαφέρει η σταθερή τιμή.",
    match: (l) => ["yellow", "green"].includes(String(billOf(l).tariff_color ?? l.profile?.color ?? "")) && Number(l.annual_kwh ?? (l.profile?.monthly_kwh ?? 0) * 12) >= 4000 },
  { key: "no_contact_30", icon: "⏸", label: "Χωρίς επαφή 30 ημέρες", description: "Ανοιχτά αιτήματα που ξεχάστηκαν.",
    match: (l) => OPEN.includes(l.status) && days(l.crm.last_contact ?? l.created_at) > 30 },
  { key: "lost_recoverable", icon: "♻️", label: "Χαμένοι που αξίζει να ξαναδούμε", description: "Απορρίφθηκαν πάνω από 30 ημέρες πριν, με εξοικονόμηση 50 €+.",
    match: (l) => l.status === "lost" && days(l.updated_at) > 30 && Number(l.savings ?? 0) >= 50 },
  { key: "accounts", icon: "👤", label: "Με λογαριασμό στο Billi", description: "Έχουν προφίλ: οι προτάσεις βγαίνουν με τα δικά τους στοιχεία.", match: (l) => !!l.user_id },
  { key: "all_open", icon: "📋", label: "Όλα τα ανοιχτά", description: "Κάθε ανοιχτό αίτημα.", match: (l) => OPEN.includes(l.status) },
];

/** Who may receive a campaign on a channel: consent for offers, and the contact detail the channel needs. */
export const reachable = (l: CrmLead, channel: "email" | "viber" | "whatsapp") => l.consent_marketing && (channel === "email" ? !!l.email : !!l.phone);

const eur = (n: number) => `${Math.round(n).toLocaleString("el-GR")} €`;

export const DEFAULT_MESSAGE =
  "Γεια σας! Είμαι {διαχειριστής} από το Billi. Με τις νέες τιμές του μήνα, για την κατανάλωσή σας το {πρόγραμμα} βγαίνει ~{κόστος}/μήνα{εξοικονόμηση}. Θέλετε να το δούμε μαζί; Η αλλαγή γίνεται χωρίς διακοπή ρεύματος.";

/** Fills the placeholders with this customer's own next best offer. */
export function renderMessage(template: string, l: CrmLead, offer: NextOffer | null, admin: string) {
  // No consumption data: a numbers template would read wrong, so ask for the bill instead.
  if (!offer && /\{(πρόγραμμα|κόστος|εξοικονόμηση)\}/.test(template)) {
    return `Γεια σας! Είμαι ${admin} από το Billi. Βγήκαν οι νέες τιμές του μήνα: στείλτε μας μια φωτογραφία του τελευταίου σας λογαριασμού και θα σας πούμε πόσα μπορείτε να γλιτώσετε.`;
  }
  return template
    .replaceAll("{διαχειριστής}", admin)
    .replaceAll("{πρόγραμμα}", offer ? `${offer.tariff.provider} ${offer.tariff.name}` : "")
    .replaceAll("{κόστος}", offer ? eur(offer.monthly) : "")
    .replaceAll("{εξοικονόμηση}", offer?.savings && offer.savings > 0 ? `, δηλαδή ~${eur(offer.savings)} λιγότερα τον χρόνο (εκτίμηση)` : "")
    .replaceAll("{πάροχος}", l.current_provider ?? "τον πάροχό σας");
}

export function offerFor(l: CrmLead, tariffs: { electricity: Tariff[]; gas: Tariff[] }) {
  const cat = billOf(l).category === "gas" ? "gas" : "electricity";
  return nextBestOffer(l, tariffs[cat], cat, l.profile);
}

/** Which sources bring signatures, not just visits. */
export function sourceStats(leads: CrmLead[]) {
  const by = new Map<string, { source: string; leads: number; signed: number; commission: number; savings: number }>();
  for (const l of leads) {
    const s = l.source?.utm_source ? `${l.source.utm_source}${l.source.utm_campaign ? ` / ${l.source.utm_campaign}` : ""}` : sourceLabel(l.source);
    const row = by.get(s) ?? { source: s, leads: 0, signed: 0, commission: 0, savings: 0 };
    row.leads++;
    if (["signed", "active"].includes(l.status)) {
      row.signed++;
      row.commission += Number(l.expected_commission) || 0;
    }
    row.savings += Number(l.savings) || 0;
    by.set(s, row);
  }
  return [...by.values()].sort((a, b) => b.signed - a.signed || b.leads - a.leads);
}

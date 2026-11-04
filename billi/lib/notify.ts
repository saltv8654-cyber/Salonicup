import type { Lead } from "./db";

const eur = (n: number | null) => (n === null ? "—" : `${Math.round(n)} €`);

/** Telegram message to the owner for every new lead. Optional: silently skipped when not configured. */
export async function notifyNewLead(lead: Lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;

  const lines = [
    "🔔 Νέο lead στο Billi",
    `👤 ${lead.name}`,
    `📞 ${lead.phone}${lead.email ? ` · ✉️ ${lead.email}` : ""}`,
    lead.preferred_time ? `🕐 ${lead.preferred_time}` : null,
    lead.tariff_label ? `⚡ Θέλει: ${lead.tariff_label}` : "⚡ Ζήτησε επικοινωνία",
    lead.current_provider ? `Τώρα: ${lead.current_provider}${lead.current_program ? ` ${lead.current_program}` : ""}` : null,
    lead.annual_kwh ? `Κατανάλωση: ${lead.annual_kwh} kWh/έτος · σήμερα ${eur(lead.current_annual)} → ${eur(lead.offer_annual)}` : null,
    lead.message ? `💬 ${lead.message}` : null,
    lead.source?.utm_source ? `Πηγή: ${lead.source.utm_source}${lead.source.utm_campaign ? ` / ${lead.source.utm_campaign}` : ""}` : null,
  ].filter(Boolean);

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: lines.join("\n") }),
    });
  } catch (e) {
    console.error("telegram notify failed:", e);
  }
}

/** Short Telegram message to the owner (tariff sync results). Skipped when Telegram is not configured. */
export async function notifyText(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch (e) {
    console.error("telegram notify failed:", e);
  }
}

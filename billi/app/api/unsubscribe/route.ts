import { NextRequest } from "next/server";
import { db, dbConfigured } from "@/lib/db";
import { readToken, siteUrl } from "@/lib/mailer";
import { recordConsent } from "@/lib/marketing";

export const runtime = "nodejs";

const page = (title: string, text: string) =>
  new Response(
    `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Billi</title></head>` +
      `<body style="margin:0;font-family:system-ui,sans-serif;background:#01030f;color:#e2e8f0;display:grid;place-items:center;min-height:100vh">` +
      `<main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:20px">${title}</h1><p style="color:#94a3b8">${text}</p>` +
      `<a href="${siteUrl()}" style="color:#67e8f9">← bill-i.vercel.app</a></main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

/** One-click opt-out from offers (link in every campaign e-mail). */
export async function GET(req: NextRequest) {
  const leadId = readToken("unsub", req.nextUrl.searchParams.get("t") ?? "");
  if (!leadId || !dbConfigured()) return page("Ο σύνδεσμος δεν ισχύει", "Για διαγραφή από τις προσφορές απάντησε στο email μας ή κάλεσέ μας.");
  const { data } = await db().from("leads").select("consent_marketing").eq("id", leadId).maybeSingle();
  if (data?.consent_marketing) {
    await db().from("leads").update({ consent_marketing: false, updated_at: new Date().toISOString() }).eq("id", leadId);
    await recordConsent({ lead_id: leadId, purpose: "marketing", granted: false, source: "unsubscribe_link" });
    await db().from("lead_activities").insert({ lead_id: leadId, type: "system", body: "🚫 Διαγραφή από τις προσφορές (σύνδεσμος email)" });
  }
  return page("Διαγράφηκες από τις προσφορές", "Δεν θα λαμβάνεις πια προσφορές από το Billi. Αν έχεις ανοιχτό αίτημα, θα επικοινωνήσουμε μαζί σου μόνο γι' αυτό.");
}

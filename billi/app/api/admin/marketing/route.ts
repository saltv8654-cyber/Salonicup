import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminName } from "@/lib/admin-auth";
import { loadCrmLeads } from "@/lib/crm-data";
import { db, dbConfigured } from "@/lib/db";
import { escapeHtml, mailConfigured, sendMail } from "@/lib/mailer";
import { DEFAULT_MESSAGE, SEGMENTS, offerFor, reachable, renderMessage, sourceStats, unsubscribeLink } from "@/lib/marketing";
import { loadTariffs } from "@/lib/tariffs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const missing = (m?: string) => !!m && /does not exist|Could not find the table/i.test(m);

/** Segments with counts, campaigns with results, and which sources bring signatures. */
export async function GET(req: NextRequest) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const { leads } = await loadCrmLeads();
  const key = req.nextUrl.searchParams.get("segment");
  const channel = (req.nextUrl.searchParams.get("channel") ?? "viber") as "email" | "viber" | "whatsapp";

  // Preview of one segment: who is in it, who can be reached, and their personalised message.
  if (key) {
    const seg = SEGMENTS.find((s) => s.key === key);
    if (!seg) return NextResponse.json({ error: "Άγνωστο τμήμα" }, { status: 400 });
    const tariffs = { electricity: (await loadTariffs("electricity")).tariffs, gas: (await loadTariffs("gas")).tariffs };
    const template = req.nextUrl.searchParams.get("message") || DEFAULT_MESSAGE;
    const members = leads.filter(seg.match).map((l) => {
      const offer = offerFor(l, tariffs);
      return {
        id: l.id, name: l.name, status: l.status, crm: l.crm, savings: l.savings, consent_marketing: l.consent_marketing,
        reachable: reachable(l, channel), email: !!l.email,
        offer: offer ? { name: `${offer.tariff.provider} ${offer.tariff.name}`, monthly: offer.monthly, savings: offer.savings } : null,
        message: renderMessage(template, l, offer, admin),
      };
    });
    return NextResponse.json({ segment: seg.key, members });
  }

  const [camps, recips] = await Promise.all([
    db().from("campaigns").select("*").order("created_at", { ascending: false }).limit(100),
    db().from("campaign_recipients").select("campaign_id, lead_id, status, sent_at").limit(20000),
  ]);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const campaigns = missing(camps.error?.message) ? null : (camps.data ?? []).map((c) => {
    const rs = (recips.data ?? []).filter((r) => r.campaign_id === c.id);
    const sent = rs.filter((r) => r.status === "sent");
    // Results: recipients whose deal moved on after the message.
    const moved = sent.filter((r) => { const l = byId.get(r.lead_id); return l && r.sent_at && l.updated_at > r.sent_at && !["new", "lost"].includes(l.status); });
    const signed = sent.filter((r) => { const l = byId.get(r.lead_id); return l && r.sent_at && l.updated_at > r.sent_at && ["signed", "active"].includes(l.status); });
    return { ...c, recipients: rs.length, sent: sent.length, pending: rs.filter((r) => r.status === "pending").length, responded: moved.length, signed: signed.length };
  });

  return NextResponse.json({
    ready: campaigns !== null,
    mail: mailConfigured(),
    segments: SEGMENTS.map((s) => {
      const m = leads.filter(s.match);
      return { key: s.key, icon: s.icon, label: s.label, description: s.description, count: m.length,
        consented: m.filter((l) => l.consent_marketing).length, email: m.filter((l) => reachable(l, "email")).length, phone: m.filter((l) => reachable(l, "viber")).length };
    }),
    campaigns: campaigns ?? [],
    sources: sourceStats(leads),
    consent: { total: leads.length, marketing: leads.filter((l) => l.consent_marketing).length },
  });
}

const Input = z.object({
  name: z.string().trim().min(1, "Δώσε όνομα στην καμπάνια").max(120),
  segment: z.string(),
  channel: z.enum(["email", "viber", "whatsapp"]),
  subject: z.string().trim().max(150).optional(),
  message: z.string().trim().min(20, "Γράψε το μήνυμα").max(2000),
  exclude: z.array(z.string()).max(2000).optional(),
});

/** Create a campaign for a segment. E-mail goes out now (with an unsubscribe link); Viber/WhatsApp are sent one by one from the list. */
export async function POST(req: NextRequest) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  const p = parsed.data;
  const seg = SEGMENTS.find((s) => s.key === p.segment);
  if (!seg) return NextResponse.json({ error: "Άγνωστο τμήμα" }, { status: 400 });
  if (p.channel === "email" && !mailConfigured()) return NextResponse.json({ error: "Για email χρειάζεται το Resend (RESEND_API_KEY, ALERTS_FROM_EMAIL)." }, { status: 503 });

  const { leads } = await loadCrmLeads();
  const tariffs = { electricity: (await loadTariffs("electricity")).tariffs, gas: (await loadTariffs("gas")).tariffs };
  const targets = leads.filter((l) => seg.match(l) && reachable(l, p.channel) && !(p.exclude ?? []).includes(l.id));
  if (!targets.length) return NextResponse.json({ error: "Κανείς στο τμήμα δεν έχει δώσει συγκατάθεση για προσφορές σε αυτό το κανάλι." }, { status: 400 });

  const { data: camp, error } = await db().from("campaigns").insert({ created_by: admin, name: p.name, segment: p.segment, channel: p.channel, subject: p.subject ?? null, message: p.message }).select().single();
  if (error) return NextResponse.json({ error: missing(error.message) ? "missing_marketing" : error.message }, { status: missing(error.message) ? 409 : 500 });

  const rows = targets.map((l) => ({ campaign_id: camp.id, lead_id: l.id, message: renderMessage(p.message, l, offerFor(l, tariffs), admin) }));
  const { error: rErr } = await db().from("campaign_recipients").insert(rows);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  let sent = 0;
  if (p.channel === "email") {
    for (const l of targets) {
      const body = rows.find((r) => r.lead_id === l.id)!.message;
      const unsub = unsubscribeLink(l.id);
      const ok = await sendMail(l.email!, p.subject || p.name, `${body}\n\n—\nΔεν θέλεις άλλες προσφορές; ${unsub}`,
        `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p><p style="color:#888;font-size:12px">Δεν θέλεις άλλες προσφορές; <a href="${unsub}">Διαγραφή</a></p>`);
      await db().from("campaign_recipients").update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null, error: ok ? null : "Η αποστολή απέτυχε" }).eq("campaign_id", camp.id).eq("lead_id", l.id);
      if (ok) {
        sent++;
        await db().from("lead_activities").insert({ lead_id: l.id, type: "email", body: `📣 Καμπάνια «${p.name}» (email)` });
      }
    }
  }
  return NextResponse.json({ campaign: camp, recipients: rows.length, sent }, { status: 201 });
}

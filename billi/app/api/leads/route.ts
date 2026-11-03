import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbConfigured, type Lead } from "@/lib/db";
import { notifyNewLead } from "@/lib/notify";
import { attachToken } from "@/lib/bill-files";

export const runtime = "nodejs";

const str = (max: number) => z.string().trim().max(max);
const money = z.number().finite().nullable().optional();

const LeadInput = z.object({
  name: str(100).min(2, "Γράψε το όνομά σου"),
  phone: str(30).regex(/^\+?[\d\s()-]{8,20}$/, "Μη έγκυρο τηλέφωνο"),
  email: z.union([z.literal(""), z.string().trim().email("Μη έγκυρο email").max(200)]).optional(),
  preferred_time: str(50).optional(),
  message: str(1000).optional(),
  consent_contact: z.literal(true, { message: "Χρειάζεται η συναίνεσή σου για να σε καλέσουμε" }),
  consent_marketing: z.boolean().optional(),
  website: z.string().max(0).optional(), // honeypot: real users never fill it
  context: z
    .object({
      tariff_id: str(120).nullable().optional(),
      tariff_label: str(200).nullable().optional(),
      current_provider: str(100).nullable().optional(),
      current_program: str(200).nullable().optional(),
      annual_kwh: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
      current_annual: money,
      offer_annual: money,
      savings: money,
      bill: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .optional(),
  source: z.record(z.string(), str(500)).optional(),
  session_id: str(64).optional(),
});

// Best-effort flood guard per instance; serverless instances don't share it, the honeypot does the rest.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Η φόρμα δεν είναι ακόμα ενεργή. Κάλεσέ μας στο τηλέφωνο." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Πολλές αιτήσεις. Δοκίμασε σε λίγα λεπτά." }, { status: 429 });

  const parsed = LeadInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true }); // bot: pretend success

  const c = d.context ?? {};
  const { data, error } = await db()
    .from("leads")
    .insert({
      name: d.name,
      phone: d.phone,
      email: d.email || null,
      preferred_time: d.preferred_time || null,
      message: d.message || null,
      consent_contact: true,
      consent_marketing: d.consent_marketing ?? false,
      tariff_id: c.tariff_id ?? null,
      tariff_label: c.tariff_label ?? null,
      current_provider: c.current_provider ?? null,
      current_program: c.current_program ?? null,
      annual_kwh: c.annual_kwh ?? null,
      current_annual: c.current_annual ?? null,
      offer_annual: c.offer_annual ?? null,
      savings: c.savings ?? null,
      bill: c.bill ?? null,
      source: d.source ?? null,
      session_id: d.session_id ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("lead insert failed:", error);
    return NextResponse.json({ error: "Κάτι πήγε στραβά. Δοκίμασε ξανά ή κάλεσέ μας." }, { status: 500 });
  }

  await db().from("lead_activities").insert({ lead_id: data.id, type: "system", body: "Νέο αίτημα από τη φόρμα του site" });
  await notifyNewLead(data as Lead);
  // The token lets this browser attach the bill file it analysed (only if the visitor ticked the box).
  return NextResponse.json({ ok: true, id: data.id, attach_token: attachToken(data.id) }, { status: 201 });
}

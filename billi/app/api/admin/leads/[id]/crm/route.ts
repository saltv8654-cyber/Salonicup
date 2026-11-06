import { NextRequest, NextResponse } from "next/server";
import { adminName } from "@/lib/admin-auth";
import { normaliseProfile, type EnergyProfile } from "@/lib/account";
import { messages, nextBestOffer } from "@/lib/crm";
import { db, dbConfigured, type Lead } from "@/lib/db";
import { loadTariffs } from "@/lib/tariffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer 360: account and saved bills, visits, open tasks, next best offer and ready messages. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = adminName(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });
  const { data: lead, error } = await db().from("leads").select("*").eq("id", params.id).single();
  if (error || !lead) return NextResponse.json({ error: error?.message ?? "Δεν βρέθηκε" }, { status: 404 });
  const l = lead as Lead;

  const [profileRes, billsRes, tasksRes, eventsRes, consentRes, campaignRes] = await Promise.all([
    l.user_id ? db().from("energy_profiles").select("*").eq("user_id", l.user_id).eq("category", "electricity").maybeSingle() : null,
    l.user_id ? db().from("user_bills").select("period_end, kwh_total, total_due").eq("user_id", l.user_id).order("period_end", { ascending: false }).limit(12) : null,
    db().from("lead_tasks").select("*").eq("lead_id", l.id).order("due_at"),
    l.session_id ? db().from("events").select("name, created_at").eq("session_id", l.session_id).order("created_at", { ascending: false }).limit(200) : null,
    db().from("consent_records").select("*").eq("lead_id", l.id).order("created_at", { ascending: false }),
    db().from("campaign_recipients").select("status, sent_at, campaigns(name, channel)").eq("lead_id", l.id).order("sent_at", { ascending: false }),
  ]);
  const profile = profileRes?.data ? (normaliseProfile(profileRes.data) as EnergyProfile) : null;
  const category = (((l.bill ?? {}) as Record<string, unknown>).category === "gas" ? "gas" : "electricity") as "gas" | "electricity";
  const offer = category === "electricity" || category === "gas" ? nextBestOffer(l, (await loadTariffs(category)).tariffs, category, profile) : null;
  const evs = (eventsRes?.data ?? []) as { name: string; created_at: string }[];

  return NextResponse.json({
    profile,
    bills: billsRes?.data ?? [],
    tasks: tasksRes.error ? null : tasksRes.data,
    visits: {
      days: new Set(evs.map((e) => e.created_at.slice(0, 10))).size,
      last: evs[0]?.created_at ?? null,
      analyses: evs.filter((e) => e.name === "analysis_ok" || e.name === "manual_calc").length,
      viewed: [...new Set(evs.map((e) => e.name))],
    },
    offer,
    messages: messages(l, offer, admin),
    consents: consentRes.error ? null : consentRes.data,
    campaigns: campaignRes.error ? [] : campaignRes.data,
  });
}

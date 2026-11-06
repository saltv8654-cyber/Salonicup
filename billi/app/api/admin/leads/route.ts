import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { normaliseProfile, type EnergyProfile } from "@/lib/account";
import { isStalled, scoreLead } from "@/lib/crm";
import { db, dbConfigured, type Lead } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/** Leads with their CRM signals: score, stalled flag, last visit and open tasks. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "Δεν έχει συνδεθεί το Supabase" }, { status: 500 });

  const { data, error } = await db().from("leads").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const leads = (data ?? []) as Lead[];

  const sids = [...new Set(leads.map((l) => l.session_id).filter(Boolean))] as string[];
  const uids = [...new Set(leads.map((l) => l.user_id).filter(Boolean))] as string[];
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const [events, acts, profiles, tasks] = await Promise.all([
    sids.length ? db().from("events").select("session_id, created_at").in("session_id", sids.slice(0, 500)).gte("created_at", since).limit(20000) : null,
    db().from("lead_activities").select("lead_id, created_at, type").order("created_at", { ascending: false }).limit(10000),
    uids.length ? db().from("energy_profiles").select("*").in("user_id", uids).eq("category", "electricity") : null,
    db().from("lead_tasks").select("*").is("done_at", null).order("due_at").limit(2000),
  ]);

  const visits = new Map<string, { days: Set<string>; last: string }>();
  for (const e of (events?.data ?? []) as { session_id: string; created_at: string }[]) {
    const v = visits.get(e.session_id) ?? { days: new Set<string>(), last: e.created_at };
    v.days.add(e.created_at.slice(0, 10));
    if (e.created_at > v.last) v.last = e.created_at;
    visits.set(e.session_id, v);
  }
  const lastAct = new Map<string, string>();
  for (const a of (acts.data ?? []) as { lead_id: string; created_at: string; type: string }[]) {
    if (a.type !== "system" && !lastAct.has(a.lead_id)) lastAct.set(a.lead_id, a.created_at);
  }
  const profileBy = new Map(((profiles?.data ?? []) as Record<string, unknown>[]).map((p) => [p.user_id as string, normaliseProfile(p) as EnergyProfile]));
  const tasksOk = !tasks.error;
  const openTasks = (tasksOk ? tasks.data ?? [] : []) as { id: string; lead_id: string; title: string; due_at: string }[];

  const enriched = leads.map((l) => {
    const v = l.session_id ? visits.get(l.session_id) : undefined;
    const last = lastAct.get(l.id) ?? null;
    const sc = scoreLead(l, { visitDays: v?.days.size ?? 0, lastSeen: v?.last ?? null, lastActivity: last, profile: l.user_id ? profileBy.get(l.user_id) ?? null : null });
    const mine = openTasks.filter((t) => t.lead_id === l.id);
    return { ...l, crm: { ...sc, stalled: isStalled(l, last), last_seen: v?.last ?? null, last_contact: last, open_tasks: mine.length, next_task: mine[0] ?? null } };
  });
  return NextResponse.json({ leads: enriched, tasks: openTasks, tasks_ready: tasksOk });
}

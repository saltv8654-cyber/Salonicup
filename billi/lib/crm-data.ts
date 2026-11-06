import { normaliseProfile, type EnergyProfile } from "./account";
import { isStalled, scoreLead, type LeadScore } from "./crm";
import { db, type Lead } from "./db";

export interface CrmMeta extends LeadScore {
  stalled: boolean;
  last_seen: string | null;
  last_contact: string | null;
  open_tasks: number;
  next_task: { id: string; lead_id: string; title: string; due_at: string } | null;
}
export type CrmLead = Lead & { crm: CrmMeta; profile: EnergyProfile | null };

/** Every lead with its CRM signals (score, stalled, last visit, tasks) and linked account profile. */
export async function loadCrmLeads() {
  const { data, error } = await db().from("leads").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
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
  const profileBy = new Map(((profiles?.data ?? []) as Record<string, unknown>[]).map((p) => [p.user_id as string, normaliseProfile(p)]));
  const tasksOk = !tasks.error;
  const openTasks = (tasksOk ? tasks.data ?? [] : []) as CrmMeta["next_task"][] & { lead_id: string }[];

  const enriched: CrmLead[] = leads.map((l) => {
    const v = l.session_id ? visits.get(l.session_id) : undefined;
    const last = lastAct.get(l.id) ?? null;
    const profile = l.user_id ? profileBy.get(l.user_id) ?? null : null;
    const sc = scoreLead(l, { visitDays: v?.days.size ?? 0, lastSeen: v?.last ?? null, lastActivity: last, profile });
    const mine = openTasks.filter((t) => t!.lead_id === l.id);
    return { ...l, profile, crm: { ...sc, stalled: isStalled(l, last), last_seen: v?.last ?? null, last_contact: last, open_tasks: mine.length, next_task: mine[0] ?? null } };
  });
  return { leads: enriched, tasks: openTasks, tasksOk };
}

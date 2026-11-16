"use server";
import { revalidatePath } from "next/cache";
import { getBusinessAccess } from "@/lib/access";
import { hasRole } from "@/lib/policy";
import { userClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { nextRun, type ScheduleSpec } from "@/lib/schedule";

const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30);
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

async function guard(businessId: string, min: "editor" | "admin") {
  const a = await getBusinessAccess(businessId);
  if (!a || !hasRole(a.role, min)) throw new Error("Χωρίς δικαίωμα");
  return a;
}

export async function saveBrand(businessId: string, form: FormData) {
  const a = await guard(businessId, "editor");
  const colors = lines(form.get("colors")).map((l) => {
    const [name, hex] = l.split(/[:=]/).map((s) => s.trim());
    return { name: hex ? name : "", hex: (hex ?? name).toLowerCase() };
  }).filter((c) => /^#[0-9a-f]{6}$/.test(c.hex));
  const fonts = lines(form.get("fonts")).map((l) => { const [role, family] = l.split(":").map((s) => s.trim()); return family ? { role, family } : { role: "main", family: role }; });
  const db = userClient();
  const { error } = await db.from("brand_profiles").update({
    voice: text(form.get("voice")), tone: text(form.get("tone")), target_audience: text(form.get("target_audience")),
    objectives: text(form.get("objectives")), guidelines: text(form.get("guidelines")),
    do_list: lines(form.get("do_list")), dont_list: lines(form.get("dont_list")),
    hashtags: lines(form.get("hashtags")), colors, fonts, updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  if (hasRole(a.role, "admin")) {
    await db.from("businesses").update({
      description: text(form.get("description")), industry: text(form.get("industry")), website: text(form.get("website")),
    }).eq("id", businessId);
  }
  await logActivity({ orgId: a.org.id, businessId, actorType: "user", actorId: a.userId, action: "brand.updated", targetType: "brand_profile", targetId: businessId });
  revalidatePath(`/b/${businessId}/settings`);
}

export async function setAutonomy(businessId: string, form: FormData) {
  const a = await guard(businessId, "admin");
  const mode = String(form.get("mode"));
  if (!["manual", "semi", "full"].includes(mode)) throw new Error("invalid mode");
  const { error } = await userClient().from("businesses").update({ autonomy_mode: mode }).eq("id", businessId);
  if (error) throw new Error(error.message);
  await logActivity({ orgId: a.org.id, businessId, actorType: "user", actorId: a.userId, action: "autonomy.mode_changed", details: { from: a.business.autonomy_mode, to: mode } });
  revalidatePath(`/b/${businessId}`, "layout");
}

/** Emergency stop. Editors can stop; only admins can resume. */
export async function setPaused(businessId: string, paused: boolean, form?: FormData) {
  const a = await guard(businessId, paused ? "editor" : "admin");
  const reason = text(form?.get("reason") ?? null);
  // businesses UPDATE is admin-only under RLS, so the stop itself goes through a narrow server-side write.
  const { serviceClient } = await import("@/lib/supabase/server");
  const { error } = await serviceClient().from("businesses")
    .update({ autonomy_paused: paused, paused_reason: paused ? reason ?? "Χειροκίνητη διακοπή" : null }).eq("id", businessId);
  if (error) throw new Error(error.message);
  if (paused) {
    // Nothing queued may start while stopped.
    await serviceClient().from("jobs").update({ status: "cancelled", last_error: "emergency stop" })
      .eq("business_id", businessId).eq("status", "queued");
  }
  await logActivity({ orgId: a.org.id, businessId, actorType: "user", actorId: a.userId, action: paused ? "autonomy.stopped" : "autonomy.resumed", details: { reason } });
  revalidatePath(`/b/${businessId}`, "layout");
}

export async function setSchedule(businessId: string, form: FormData) {
  const a = await guard(businessId, "editor");
  const workflow = String(form.get("workflow")) as ScheduleSpec["workflow"];
  const enabled = form.get("enabled") === "on";
  const spec: ScheduleSpec = {
    workflow, hour_local: Math.min(23, Math.max(0, Number(form.get("hour") ?? 8))),
    weekday: workflow === "weekly_strategy" ? Number(form.get("weekday") ?? 1) : null,
    monthday: workflow === "monthly_report" ? Math.min(28, Math.max(1, Number(form.get("monthday") ?? 1))) : null,
  };
  const { error } = await userClient().from("workflow_schedules").update({
    enabled, hour_local: spec.hour_local, weekday: spec.weekday, monthday: spec.monthday,
    next_run_at: enabled ? nextRun(spec, a.business.timezone, new Date()).toISOString() : null,
  }).eq("business_id", businessId).eq("workflow", workflow);
  if (error) throw new Error(error.message);
  await logActivity({ orgId: a.org.id, businessId, actorType: "user", actorId: a.userId, action: "schedule.updated", details: { workflow, enabled } });
  revalidatePath(`/b/${businessId}/settings`);
}

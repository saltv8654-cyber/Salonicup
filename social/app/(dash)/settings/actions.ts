"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/access";
import { getSettings } from "@/lib/settings";
import { serviceClient, userClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { nextRun, type ScheduleSpec } from "@/lib/schedule";

const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30);
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function saveBrand(form: FormData) {
  const a = await requireAdmin();
  const colors = lines(form.get("colors")).map((l) => {
    const [name, hex] = l.split(/[:=]/).map((s) => s.trim());
    return { name: hex ? name : "", hex: (hex ?? name).toLowerCase() };
  }).filter((c) => /^#[0-9a-f]{6}$/.test(c.hex));
  const fonts = lines(form.get("fonts")).map((l) => {
    const [role, family] = l.split(":").map((s) => s.trim());
    return family ? { role, family } : { role: "main", family: role };
  });
  const budget = Number(form.get("monthly_ai_budget_usd"));
  const { error } = await userClient().from("social_settings").update({
    description: text(form.get("description")), website: text(form.get("website")),
    voice: text(form.get("voice")), tone: text(form.get("tone")), target_audience: text(form.get("target_audience")),
    objectives: text(form.get("objectives")), guidelines: text(form.get("guidelines")),
    do_list: lines(form.get("do_list")), dont_list: lines(form.get("dont_list")), hashtags: lines(form.get("hashtags")),
    colors, fonts, monthly_ai_budget_usd: Number.isFinite(budget) && budget >= 0 ? budget : 50,
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) throw new Error(error.message);
  await logActivity({ actorType: "user", actorId: a.userId, action: "brand.updated", targetType: "settings", targetId: "brand" });
  revalidatePath("/settings");
}

export async function setAutonomy(form: FormData) {
  const a = await requireAdmin();
  const mode = String(form.get("mode"));
  if (!["manual", "semi", "full"].includes(mode)) throw new Error("invalid mode");
  const before = (await getSettings())?.autonomy_mode;
  const { error } = await userClient().from("social_settings").update({ autonomy_mode: mode }).eq("id", true);
  if (error) throw new Error(error.message);
  await logActivity({ actorType: "user", actorId: a.userId, action: "autonomy.mode_changed", details: { from: before, to: mode } });
  revalidatePath("/", "layout");
}

/** Emergency stop / resume. */
export async function setPaused(paused: boolean, form?: FormData) {
  const a = await requireAdmin();
  const reason = text(form?.get("reason") ?? null);
  const { error } = await userClient().from("social_settings")
    .update({ paused, paused_reason: paused ? reason ?? "Χειροκίνητη διακοπή" : null }).eq("id", true);
  if (error) throw new Error(error.message);
  if (paused) {
    // Nothing queued may start while stopped.
    await serviceClient().from("social_jobs").update({ status: "cancelled", last_error: "emergency stop" }).eq("status", "queued");
  }
  await logActivity({ actorType: "user", actorId: a.userId, action: paused ? "autonomy.stopped" : "autonomy.resumed", details: { reason } });
  revalidatePath("/", "layout");
}

export async function setSchedule(form: FormData) {
  const a = await requireAdmin();
  const workflow = String(form.get("workflow")) as ScheduleSpec["workflow"];
  if (!["daily_check", "weekly_strategy", "monthly_report"].includes(workflow)) throw new Error("invalid workflow");
  const enabled = form.get("enabled") === "on";
  const spec: ScheduleSpec = {
    workflow, hour_local: Math.min(23, Math.max(0, Number(form.get("hour") ?? 8))),
    weekday: workflow === "weekly_strategy" ? Number(form.get("weekday") ?? 1) : null,
    monthday: workflow === "monthly_report" ? Math.min(28, Math.max(1, Number(form.get("monthday") ?? 1))) : null,
  };
  const tz = (await getSettings())?.timezone ?? "Europe/Athens";
  const { error } = await userClient().from("social_schedules").update({
    enabled, hour_local: spec.hour_local, weekday: spec.weekday, monthday: spec.monthday,
    next_run_at: enabled ? nextRun(spec, tz, new Date()).toISOString() : null,
  }).eq("workflow", workflow);
  if (error) throw new Error(error.message);
  await logActivity({ actorType: "user", actorId: a.userId, action: "schedule.updated", details: { workflow, enabled } });
  revalidatePath("/settings");
}

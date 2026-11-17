// Every Thursday: the coming week's programme, one post per league, in the Posts tab design.
// Deterministic (no AI): the facts come from the league database, the caption from a template.
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderPost, PostError, type PostFormat } from "../posts/render";
import { savePost } from "../posts/store";
import { athensDateKey, weekDays } from "../posts/build";
import type { DayGroup } from "../posts/canvas";
import { decide, type AutonomyMode, type Trigger } from "../policy";

export interface WeeklyProgramOptions {
  /** "next": the week starting next Monday (default). "current": the week we are in. */
  week?: "next" | "current";
  platforms?: string[];
}

export interface WeeklyProgramResult {
  status: "done" | "stopped";
  week_start: string;
  created: { league: string; content_id: string; status: string }[];
  skipped: { league: string; reason: string }[];
}

/** Monday (YYYY-MM-DD, Athens) of the week the post is about. */
export function targetMonday(now: Date, week: "next" | "current" = "next"): string {
  const monday = weekDays(athensDateKey(now.toISOString()))[0].key;
  if (week === "current") return monday;
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** Caption with every match of the week, as people read it on Instagram/Facebook. */
export function weeklyCaption(league: string, range: string, groups: DayGroup[], hashtags: string[]): string {
  const days = groups.map((g) =>
    [`🗓️ ${g.day}`, ...g.matches.map((m) => `${m.time ? `${m.time} ` : ""}${m.homeName} – ${m.awayName}${m.field ? ` (${m.field})` : ""}${m.tag ? ` · ${m.tag}` : ""}`)].join("\n"));
  const leagueTag = `#${league.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase()}`;
  const tags = [...new Set([...hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)), leagueTag])].join(" ");
  return [`📅 Το πρόγραμμα της εβδομάδας για το ${league}`, `${range.replace("Εβδομάδα ", "")}`, "", ...days.flatMap((d) => [d, ""]), "Καλή επιτυχία σε όλες τις ομάδες! ⚽", "", tags].join("\n").trim();
}

export async function runWeeklyProgram(db: SupabaseClient, o: { trigger: Trigger; now?: Date; userId?: string | null; options?: WeeklyProgramOptions }): Promise<WeeklyProgramResult> {
  const now = o.now ?? new Date();
  const week = o.options?.week ?? "next";
  const platforms = o.options?.platforms?.length ? o.options.platforms : ["instagram", "facebook"];
  const monday = targetMonday(now, week);
  const result: WeeklyProgramResult = { status: "done", week_start: monday, created: [], skipped: [] };

  const { data: settings, error } = await db.from("social_settings").select("autonomy_mode,paused,hashtags").single();
  if (error || !settings) throw new Error(`social_settings: ${error?.message ?? "missing"}`);
  if (settings.paused && o.trigger !== "chat") return { ...result, status: "stopped" };

  const { data: leagues } = await db.from("leagues").select("league_id,name").eq("active", true).order("sort_order");
  for (const league of leagues ?? []) {
    const key = `weekly_program:${league.league_id}:${monday}`;
    const { data: existing } = await db.from("social_content").select("id").eq("source_key", key).maybeSingle();
    if (existing) { result.skipped.push({ league: league.name, reason: "υπάρχει ήδη για αυτή την εβδομάδα" }); continue; }

    const renders = [];
    try {
      for (const format of ["square", "story"] as PostFormat[])
        renders.push(await renderPost(db, { type: "week", format, week_date: monday, week_mode: "program", league_ids: [league.league_id] }));
    } catch (e) {
      if (e instanceof PostError) { result.skipped.push({ league: league.name, reason: e.message }); continue; }
      throw e;
    }
    const post = renders[0].post;
    const range = post.sub.split(" · ")[0];
    const { data: item, error: insErr } = await db.from("social_content").insert({
      kind: "post", title: `Πρόγραμμα εβδομάδας · ${league.name} · ${range.replace("Εβδομάδα ", "")}`,
      brief: "Αυτόματο post Πέμπτης: το πρόγραμμα της εβδομάδας του πρωταθλήματος (σχέδιο «Εβδομάδα» της καρτέλας Posts). Τετράγωνο για το feed, story για τα stories.",
      caption: weeklyCaption(league.name, range, post.groups, settings.hashtags ?? []),
      hashtags: [], platforms, status: "draft", planned_for: now.toISOString(), created_by: "agent", source_key: key,
    }).select("id,title").single();
    if (insErr || !item) {
      // Another run created it in the meantime (unique source_key): nothing to do.
      if (insErr?.code === "23505") { result.skipped.push({ league: league.name, reason: "υπάρχει ήδη για αυτή την εβδομάδα" }); continue; }
      throw new Error(`social_content: ${insErr?.message}`);
    }
    for (const r of renders) await savePost(db, r, { type: "week", format: r.format }, item.id);

    // Publishing commitment, according to the autonomy mode.
    const decision = decide({ action: "schedule_post", mode: settings.autonomy_mode as AutonomyMode, paused: settings.paused, trigger: o.trigger });
    let status = "draft";
    if (decision === "allow") {
      await db.from("social_content").update({ status: "scheduled", scheduled_for: now.toISOString() }).eq("id", item.id);
      status = "scheduled";
    } else if (decision === "needs_approval") {
      await db.from("social_content").update({ status: "pending_approval" }).eq("id", item.id);
      await db.from("social_approvals").insert({
        action: "schedule_post", target_type: "content", target_id: item.id, requested_by: "system",
        summary: `Δημοσίευση: «${item.title}»`, payload: { scheduled_for: now.toISOString(), platforms },
      });
      status = "pending_approval";
    }
    await db.from("social_activity").insert({
      actor_type: o.trigger === "chat" ? "user" : "system", actor_id: o.userId ?? null, action: "weekly_program.created",
      target_type: "content", target_id: item.id, details: { league: league.name, week_start: monday, status },
    });
    result.created.push({ league: league.name, content_id: item.id, status });
  }
  return result;
}

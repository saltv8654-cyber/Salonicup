// Recurring posts per league, in the Posts tab designs, without AI:
//   weekly_program   – every Thursday: the week's programme (square + story)
//   weekly_standings – every Monday: the standings after the weekend's round (square + story)
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderPost, PostError, type PostFormat, type PostSpec, type RenderedPost } from "../posts/render";
import { savePost } from "../posts/store";
import { athensDateKey, weekDays } from "../posts/build";
import type { DayGroup, StandRow } from "../posts/canvas";
import { decide, type AutonomyMode, type Trigger } from "../policy";

export type RecurringKind = "weekly_program" | "weekly_standings";

export interface RecurringOptions {
  /** weekly_program: "next" = the week starting next Monday (default), "current" = this week. */
  week?: "next" | "current";
  platforms?: string[];
}

export interface RecurringResult {
  status: "done" | "stopped";
  week_start: string;
  created: { league: string; content_id: string; status: string }[];
  skipped: { league: string; reason: string }[];
}

const FORMATS: PostFormat[] = ["square", "story"];
const addDays = (key: string, n: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Monday (YYYY-MM-DD, Athens) of the week the programme post is about. */
export function targetMonday(now: Date, week: "next" | "current" = "next"): string {
  const monday = weekDays(athensDateKey(now.toISOString()))[0].key;
  return week === "current" ? monday : addDays(monday, 7);
}

const leagueTag = (league: string) => `#${league.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase()}`;
const tagLine = (league: string, hashtags: string[]) =>
  [...new Set([...hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)), leagueTag(league)])].join(" ");

/** Programme caption: every match of the week. */
export function weeklyCaption(league: string, range: string, groups: DayGroup[], hashtags: string[]): string {
  const days = groups.map((g) =>
    [`🗓️ ${g.day}`, ...g.matches.map((m) => `${m.time ? `${m.time} ` : ""}${m.homeName} – ${m.awayName}${m.field ? ` (${m.field})` : ""}${m.tag ? ` · ${m.tag}` : ""}`)].join("\n"));
  return [`📅 Το πρόγραμμα της εβδομάδας για το ${league}`, `${range.replace("Εβδομάδα ", "")}`, "", ...days.flatMap((d) => [d, ""]), "Καλή επιτυχία σε όλες τις ομάδες! ⚽", "", tagLine(league, hashtags)].join("\n").trim();
}

/** Standings caption: the top three and the leader's points. */
export function standingsCaption(league: string, round: number | null, rows: StandRow[], hashtags: string[]): string {
  const medals = ["🥇", "🥈", "🥉"];
  const top = rows.slice(0, 3).map((r, i) => `${medals[i]} ${r.name} · ${r.points} β.`);
  return [
    `📊 Η βαθμολογία του ${league}${round ? ` μετά την ${round}η αγωνιστική` : ""}`, "",
    ...top, "", "Όλη η βαθμολογία και τα στατιστικά στο salonicup.gr", "", tagLine(league, hashtags),
  ].join("\n").trim();
}

interface Plan { key: string; title: string; brief: string; specs: PostSpec[]; caption: (r: RenderedPost) => string }

export async function runRecurringPosts(db: SupabaseClient, kind: RecurringKind,
  o: { trigger: Trigger; now?: Date; userId?: string | null; options?: RecurringOptions }): Promise<RecurringResult> {
  const now = o.now ?? new Date();
  const platforms = o.options?.platforms?.length ? o.options.platforms : ["instagram", "facebook"];
  const weekStart = kind === "weekly_program" ? targetMonday(now, o.options?.week ?? "next") : targetMonday(now, "current");
  const result: RecurringResult = { status: "done", week_start: weekStart, created: [], skipped: [] };

  const { data: settings, error } = await db.from("social_settings").select("autonomy_mode,paused,hashtags").single();
  if (error || !settings) throw new Error(`social_settings: ${error?.message ?? "missing"}`);
  if (settings.paused && o.trigger !== "chat") return { ...result, status: "stopped" };
  const hashtags: string[] = settings.hashtags ?? [];

  const { data: leagues } = await db.from("leagues").select("league_id,name").eq("active", true).order("sort_order");
  for (const league of leagues ?? []) {
    const key = `${kind}:${league.league_id}:${weekStart}`;
    const { data: existing } = await db.from("social_content").select("id").eq("source_key", key).maybeSingle();
    if (existing) { result.skipped.push({ league: league.name, reason: "υπάρχει ήδη για αυτή την εβδομάδα" }); continue; }

    // What to make for this league (or why not).
    let plan: Plan;
    if (kind === "weekly_program") {
      plan = {
        key, title: "", brief: "Αυτόματο post Πέμπτης: το πρόγραμμα της εβδομάδας του πρωταθλήματος (σχέδιο «Εβδομάδα» της καρτέλας Posts). Τετράγωνο για το feed, story για τα stories.",
        specs: FORMATS.map((format) => ({ type: "week", format, week_date: weekStart, week_mode: "program", league_ids: [league.league_id] })),
        caption: (r) => weeklyCaption(league.name, r.post.sub.split(" · ")[0], r.post.groups, hashtags),
      };
    } else {
      // The standings only change when regular-season matches were played; otherwise nothing new to post.
      const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      const { data: played } = await db.from("matches").select("round,stage,match_date")
        .eq("league_id", league.league_id).in("match_status", ["Played", "Forfeit"]).gte("match_date", since);
      const regular = (played ?? []).filter((m) => !m.stage && m.match_date <= now.toISOString());
      if (!regular.length) { result.skipped.push({ league: league.name, reason: "δεν έπαιξε αγώνα πρωταθλήματος τις τελευταίες 7 ημέρες" }); continue; }
      const round = Math.max(...regular.map((m) => Number(m.round) || 0)) || null;
      plan = {
        key, title: "", brief: "Αυτόματο post Δευτέρας: η βαθμολογία μετά την αγωνιστική (σχέδιο «Βαθμολογία» της καρτέλας Posts). Τετράγωνο για το feed, story για τα stories.",
        specs: FORMATS.map((format) => ({ type: "standings", format, league_id: league.league_id })),
        caption: (r) => standingsCaption(league.name, round, r.post.standings, hashtags),
      };
      plan.title = `Βαθμολογία · ${league.name}${round ? ` · μετά την ${round}η αγωνιστική` : ""}`;
    }

    const renders: RenderedPost[] = [];
    try {
      for (const spec of plan.specs) renders.push(await renderPost(db, spec));
    } catch (e) {
      if (e instanceof PostError) { result.skipped.push({ league: league.name, reason: e.message }); continue; }
      throw e;
    }
    if (kind === "weekly_program") plan.title = `Πρόγραμμα εβδομάδας · ${league.name} · ${renders[0].post.sub.split(" · ")[0].replace("Εβδομάδα ", "")}`;

    const { data: item, error: insErr } = await db.from("social_content").insert({
      kind: "post", title: plan.title, brief: plan.brief, caption: plan.caption(renders[0]),
      hashtags: [], platforms, status: "draft", planned_for: now.toISOString(), created_by: "agent", source_key: key,
    }).select("id,title").single();
    if (insErr || !item) {
      // Another run created it in the meantime (unique source_key): nothing to do.
      if (insErr?.code === "23505") { result.skipped.push({ league: league.name, reason: "υπάρχει ήδη για αυτή την εβδομάδα" }); continue; }
      throw new Error(`social_content: ${insErr?.message}`);
    }
    for (let i = 0; i < renders.length; i++) await savePost(db, renders[i], plan.specs[i], item.id);

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
      actor_type: o.trigger === "chat" ? "user" : "system", actor_id: o.userId ?? null, action: `${kind}.created`,
      target_type: "content", target_id: item.id, details: { league: league.name, week_start: weekStart, status },
    });
    result.created.push({ league: league.name, content_id: item.id, status });
  }
  return result;
}

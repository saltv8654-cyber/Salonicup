import { z } from "zod";
import { POST_FORMATS, POST_TYPES, type PostFormat, type PostType } from "./render";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const Spec = z.object({
  type: z.enum(Object.keys(POST_TYPES) as [PostType, ...PostType[]]),
  format: z.enum(Object.keys(POST_FORMATS) as [PostFormat, ...PostFormat[]]).optional(),
  league_id: z.string().uuid().optional(),
  match_id: z.string().uuid().optional(),
  round: z.string().regex(/^(\d{1,3}|QF:[12]|SF:[12]|Final)$/).optional().describe('schedule/results: round number, "QF:1", "SF:2" or "Final"'),
  day: date.optional().describe("schedule/results: a day instead of a round; odds: the day"),
  week_date: date.optional().describe("week: any date inside the week"),
  week_mode: z.enum(["program", "results"]).optional(),
  league_ids: z.array(z.string().uuid()).max(10).optional().describe("week: leagues to include (default all active)"),
  sponsors: z.boolean().optional().describe("show the sponsor strip (default true, as in the Posts tab)"),
});

/** From URL search params (Studio preview), ignoring empty values. */
export function specFromParams(p: URLSearchParams) {
  const o: Record<string, unknown> = Object.fromEntries([...p.entries()].filter(([k, v]) => v !== "" && k !== "league_ids"));
  const ids = p.getAll("league_ids").filter(Boolean);
  if (ids.length) o.league_ids = ids;
  if (o.sponsors !== undefined) o.sponsors = o.sponsors !== "false";
  return Spec.safeParse(o);
}

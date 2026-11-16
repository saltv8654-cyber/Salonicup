// Next run times for daily / weekly / monthly workflows in the configured timezone (DST-safe).

export type Workflow = "daily_check" | "weekly_strategy" | "monthly_report";
export interface ScheduleSpec {
  workflow: Workflow;
  hour_local: number;
  weekday: number | null; // 0 = Sunday
  monthday: number | null;
}

/** Wall-clock parts of an instant in a timezone. */
function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour, min: o.minute, s: o.second };
}

/** UTC instant for a wall-clock time in tz. */
export function zonedToUtc(y: number, m: number, d: number, h: number, tz: string): Date {
  const target = Date.UTC(y, m - 1, d, h);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess), tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

export function nextRun(spec: ScheduleSpec, tz: string, after: Date): Date {
  const now = parts(after, tz);
  for (let offset = 0; offset < 400; offset++) {
    const day = new Date(Date.UTC(now.y, now.m - 1, now.d + offset));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (spec.workflow === "weekly_strategy" && day.getUTCDay() !== (spec.weekday ?? 1)) continue;
    if (spec.workflow === "monthly_report" && d !== (spec.monthday ?? 1)) continue;
    const at = zonedToUtc(y, m, d, spec.hour_local, tz);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("no next run found");
}

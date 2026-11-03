/**
 * Gas use is dominated by heating, so a winter bill × 12 wildly overstates the year. We spread a year's use as
 * 25% flat base load (cooking, hot water) plus 75% heating with a typical Greek monthly profile. Rough, but far
 * closer than a linear extrapolation; the UI says it is an estimate.
 */
const HEATING = [0.24, 0.2, 0.15, 0.07, 0.01, 0, 0, 0, 0, 0.03, 0.12, 0.18]; // Jan..Dec, sums to 1
const BASE = 0.25;
export const GAS_MONTH_SHARE = HEATING.map((h) => BASE / 12 + (1 - BASE) * h);

/** "04/03/2026" or "2026-03-04" → Date (UTC midnight), or null. */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

/** Share of a typical year's gas use that falls between two dates (inclusive). */
export function gasYearFraction(start: Date, end: Date): number {
  let f = 0;
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    f += GAS_MONTH_SHARE[d.getUTCMonth()] / daysInMonth;
  }
  return f;
}

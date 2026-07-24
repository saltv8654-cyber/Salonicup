import { fmtMinute } from '@/lib/match'
import type { Period } from '@/lib/types'

/** Καταστάσεις χρονομέτρου αγώνα (αποθηκεύονται στο matches.clock_period). */
export type ClockPeriod = 'H1' | 'HT' | 'H2' | 'ET' | 'FT'

const RUNNING: ClockPeriod[] = ['H1', 'H2', 'ET']

/** Τρέχει το χρονόμετρο αυτή τη στιγμή; (Α΄/Β΄ ημίχρονο ή παράταση) */
export function isRunning(cp?: string | null): cp is 'H1' | 'H2' | 'ET' {
  return !!cp && RUNNING.includes(cp as ClockPeriod)
}

/** Σύντομη ετικέτα ημιχρόνου (Α΄/Β΄/Παρ.) — null για ΗΜ/ΤΕΛ/πριν. */
export function clockHalf(cp?: string | null): string | null {
  return cp === 'H1' ? 'Α΄' : cp === 'H2' ? 'Β΄' : cp === 'ET' ? 'Παρ.' : null
}

/** Σχετικό λεπτό μέσα στο ημίχρονο (1-based), για αποθήκευση event / εμφάνιση. */
export function clockRel(startedAt: string, now = Date.now()): number {
  const sec = (now - new Date(startedAt).getTime()) / 1000
  return Math.max(1, Math.floor(sec / 60) + 1)
}

/**
 * Ζωντανή ετικέτα χρονομέτρου:
 *   τρέχει  → "12'", "30+2'"
 *   ημίχρονο → "ΗΜ"
 *   τελικό  → "ΤΕΛ"
 *   πριν/χωρίς → null
 */
export function clockLabel(
  clockPeriod: string | null | undefined,
  startedAt: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!clockPeriod) return null
  if (clockPeriod === 'HT') return 'ΗΜ'
  if (clockPeriod === 'FT') return 'ΤΕΛ'
  if (!startedAt) return null
  return fmtMinute(clockPeriod as Period, clockRel(startedAt, now))
}

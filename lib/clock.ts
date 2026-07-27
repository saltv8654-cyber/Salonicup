/** Καταστάσεις χρονομέτρου αγώνα (αποθηκεύονται στο matches.clock_period). */
export type ClockPeriod = 'H1' | 'HT' | 'H2' | 'ET' | 'FT'

const RUNNING: ClockPeriod[] = ['H1', 'H2', 'ET']

/** Τρέχει το χρονόμετρο αυτή τη στιγμή; (Α΄/Β΄ ημίχρονο ή παράταση) */
export function isRunning(cp?: string | null): cp is 'H1' | 'H2' | 'ET' {
  return !!cp && RUNNING.includes(cp as ClockPeriod)
}

/** Ετικέτα ημιχρόνου (Α΄ Ημίχ / Β΄ Ημίχ / Παράταση) — null για ΗΜ/ΤΕΛ/πριν. */
export function clockHalf(cp?: string | null): string | null {
  return cp === 'H1' ? 'Α΄ Ημίχ' : cp === 'H2' ? 'Β΄ Ημίχ' : cp === 'ET' ? 'Παράταση' : null
}

/** Σχετικό λεπτό μέσα στο ημίχρονο (1-based), για αποθήκευση event / εμφάνιση. */
export function clockRel(startedAt: string, now = Date.now()): number {
  const sec = (now - new Date(startedAt).getTime()) / 1000
  return Math.max(1, Math.floor(sec / 60) + 1)
}

/** Βάση λεπτών ανά ημίχρονο (Α΄ ξεκινά 0, Β΄ στο 30, παράταση στο 60). */
const BASE_MIN: Record<string, number> = { H1: 0, H2: 30, ET: 60 }

/**
 * Ζωντανή ετικέτα χρονομέτρου σε ΛΕΠΤΑ:ΔΕΥΤΕΡΟΛΕΠΤΑ:
 *   τρέχει  → "12:34", "31:05" (χωρίς ένδειξη ημιχρόνου)
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
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const total = (BASE_MIN[clockPeriod] ?? 0) * 60 + elapsed
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

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

/** Κανονικό τέλος ημιχρόνου σε ΣΥΝΟΛΙΚΑ λεπτά (Α΄→30, Β΄→60, παράταση→65). */
const CAP_MIN: Record<string, number> = { H1: 30, H2: 60, ET: 65 }

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

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/**
 * Ρολόι με ξεχωριστές καθυστερήσεις (στυλ Champions League):
 *   { main, added } όπου το «main» ΠΑΓΩΝΕΙ στο κανονικό τέλος του ημιχρόνου
 *   (Α΄ 30:00, Β΄ 60:00, παράταση 65:00) και το «added» δείχνει ξεχωριστά
 *   τον χρόνο καθυστέρησης ως "+M:SS" όταν έχει ξεπεραστεί το κανονικό.
 *   ΗΜ/ΤΕΛ → { main: 'ΗΜ'|'ΤΕΛ', added: null }· πριν/χωρίς → null.
 */
export function clockStoppage(
  clockPeriod: string | null | undefined,
  startedAt: string | null | undefined,
  now = Date.now(),
): { main: string; added: string | null } | null {
  const label = clockLabel(clockPeriod, startedAt, now)
  if (label == null) return null
  if (!clockPeriod || !startedAt || clockPeriod === 'HT' || clockPeriod === 'FT')
    return { main: label, added: null }
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const total = (BASE_MIN[clockPeriod] ?? 0) * 60 + elapsed
  const cap = (CAP_MIN[clockPeriod] ?? Infinity) * 60
  if (total <= cap) return { main: label, added: null }
  return { main: mmss(cap), added: `+${mmss(total - cap)}` }
}

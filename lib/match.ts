import type { Period, EventType } from '@/lib/types'

/** Salonicup: 30' + 30', 5' καθυστερήσεις ανά ημίχρονο, 5' παράταση, 5-5 πέναλτι */
export const PERIODS: { id: Period; short: string; label: string; base: number; cap: number }[] = [
  { id: 'H1',  short: "Α'",  label: "Α' ημίχρονο", base: 0,  cap: 30 },
  { id: 'H2',  short: "Β'",  label: "Β' ημίχρονο", base: 30, cap: 30 },
  { id: 'ET',  short: 'Παρ', label: 'Παράταση',    base: 60, cap: 5  },
  { id: 'PEN', short: 'Πεν', label: 'Πέναλτι',     base: 0,  cap: 0  },
]

/**
 * Ο speaker γράφει λεπτό σχετικό με το ημίχρονο (1–30).
 * Πάνω από το cap → καθυστερήσεις.
 *   H1, 3  → 3'
 *   H1, 33 → 30+3'
 *   H2, 3  → 33'
 *   H2, 33 → 60+3'
 */
export function fmtMinute(period: Period, raw: number | string | null): string {
  if (period === 'PEN') return 'ΠΕΝ'
  if (raw === null || raw === '') return '—'
  const P = PERIODS.find(p => p.id === period)!
  const n = typeof raw === 'string' ? parseInt(raw) : raw
  if (isNaN(n)) return '—'
  if (n > P.cap) return `${P.base + P.cap}+${n - P.cap}'`
  return `${P.base + n}'`
}

/** Απόλυτο λεπτό, για ταξινόμηση */
export function absMinute(period: Period, raw: number | null): number {
  if (period === 'PEN') return 9999
  const P = PERIODS.find(p => p.id === period)!
  const n = raw ?? 0
  return P.base + Math.min(n, P.cap) + (n > P.cap ? (n - P.cap) * 0.1 : 0)
}

export const EVENTS: Record<EventType, { label: string; icon: string }> = {
  GOAL:       { label: 'Γκολ',     icon: '⚽' },
  ASSIST:     { label: 'Ασίστ',    icon: '🅰' },
  OWN:        { label: 'Αυτογκόλ', icon: '🔻' },
  YELLOW:     { label: 'Κίτρινη',  icon: '🟨' },
  RED:        { label: 'Κόκκινη',  icon: '🟥' },
  PEN_SCORED: { label: 'Εύστοχο',  icon: '✅' },
  PEN_MISSED: { label: 'Άστοχο',   icon: '❌' },
}

export const PLAY_EVENTS: EventType[] = ['GOAL', 'ASSIST', 'OWN', 'YELLOW', 'RED']
export const PEN_EVENTS:  EventType[] = ['PEN_SCORED', 'PEN_MISSED']

export const MAX_POSTPONEMENTS = 2

import { athensDateKey, TZ } from '@/lib/time'

// Ελεύθερα γήπεδα από ΕΒΔΟΜΑΔΙΑΙΑ διαθεσιμότητα (σταθερό μοτίβο) μείον τους αγώνες.
// Το μοτίβο το ορίζει ο admin μία φορά (σελίδα «Ελεύθερα»). Έτσι εμφανίζονται και
// τελείως άδειες ώρες (π.χ. Σάββατο 16:00 χωρίς κανέναν αγώνα), κάτι που δεν
// προκύπτει από τους αγώνες μόνο.
//
// Μορφή κάθε γραμμής:  <μέρες> | <πίστες> | <ώρες>
//   π.χ.  Σαβ, Κυρ | Γήπ. 3, Γήπ. 4 | 16:00, 17:30, 19:00, 20:30, 22:00

export type FreeSlot = { iso: string; field: string | null; venue: string | null }
type MatchLite = { field: string | null; match_date: string | null }
type VenueLite = { name: string; fields: string[] | null }
type Rule = { days: number[]; fields: string[]; times: { h: number; m: number }[] }

const DAY: Record<string, number> = { κυ: 0, δε: 1, τρ: 2, τε: 3, πε: 4, πα: 5, σα: 6 }
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const normField = (s: string) => fold(s).replace(/[.\s]/g, '')
const key = (f: string | null, iso: string) => `${f ?? ''}|${new Date(iso).getTime()}`

export function parseAvailability(text: string): Rule[] {
  const rules: Rule[] = []
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split('|').map(s => s.trim())
    if (parts.length < 3) continue
    const days = parts[0].split(/[,\s]+/)
      .map(t => { const k = fold(t).slice(0, 2); return k in DAY ? DAY[k] : null })
      .filter((d): d is number => d != null)
    const fields = parts[1].split(',').map(s => s.trim()).filter(Boolean)
    const times = parts[2].split(',')
      .map(t => { const m = t.trim().match(/^(\d{1,2}):(\d{2})$/); return m ? { h: +m[1], m: +m[2] } : null })
      .filter((x): x is { h: number; m: number } => !!x)
    if (days.length && fields.length && times.length) rules.push({ days, fields, times })
  }
  return rules
}

// UTC instant που αντιστοιχεί σε τοπική ώρα Ελλάδας (χειρίζεται και θερινή ώρα).
function athensInstant(y: number, m0: number, d: number, hh: number, mm: number): Date {
  let ts = Date.UTC(y, m0, d, hh, mm)
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts))
    const g = (t: string) => +(p.find(x => x.type === t)!.value)
    let hr = g('hour'); if (hr === 24) hr = 0
    const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), hr, g('minute'))
    const diff = Date.UTC(y, m0, d, hh, mm) - asUTC
    ts += diff
    if (!diff) break
  }
  return new Date(ts)
}

const addDaysKey = (k: string, days: number) =>
  athensDateKey(new Date(new Date(k + 'T00:00:00Z').getTime() + days * 86400000).toISOString())

/** Ελεύθερα γήπεδα από τη διαθεσιμότητα, μείον τους υπάρχοντες αγώνες. */
export function computeFreeFromAvailability(
  availText: string, matches: MatchLite[], venues: VenueLite[],
): FreeSlot[] {
  const rules = parseAvailability(availText)
  if (!rules.length) return []

  const booked = new Set<string>()
  for (const m of matches) if (m.match_date) booked.add(key(m.field, m.match_date))

  // Κανονικά ονόματα πιστών (ώστε «γηπ 4» ↔ «Γήπ. 4») + όνομα γηπέδου
  const canon = new Map<string, string>()
  const fieldVenue = new Map<string, string>()
  for (const v of venues) for (const f of v.fields ?? []) {
    if (!canon.has(normField(f))) canon.set(normField(f), f)
    if (!fieldVenue.has(f)) fieldVenue.set(f, v.name)
  }
  const resolveField = (f: string) => canon.get(normField(f)) ?? f

  // Ορίζοντας: μέχρι τον τελευταίο αγώνα (αλλιώς +35 μέρες από σήμερα)
  const todayKey = athensDateKey(new Date().toISOString())
  let lastKey = todayKey
  for (const m of matches) if (m.match_date) { const k = athensDateKey(m.match_date); if (k > lastKey) lastKey = k }
  const horizonKey = lastKey > todayKey ? lastKey : addDaysKey(todayKey, 35)

  const out = new Map<string, FreeSlot>()
  let cur = new Date(todayKey + 'T00:00:00Z').getTime()
  const endTs = new Date(horizonKey + 'T00:00:00Z').getTime()
  for (let guard = 0; cur <= endTs && guard < 260; guard++, cur += 86400000) {
    const dayKey = athensDateKey(new Date(cur).toISOString())
    const dow = new Date(dayKey + 'T00:00:00Z').getUTCDay()
    const [Y, Mo, D] = dayKey.split('-').map(Number)
    for (const r of rules) {
      if (!r.days.includes(dow)) continue
      for (const rf of r.fields) {
        const f = resolveField(rf)
        for (const t of r.times) {
          const iso = athensInstant(Y, Mo - 1, D, t.h, t.m).toISOString()
          const kk = key(f, iso)
          if (!booked.has(kk) && !out.has(kk))
            out.set(kk, { iso, field: f, venue: fieldVenue.get(f) ?? null })
        }
      }
    }
  }
  return [...out.values()]
}

/** Προεπιλεγμένη διαθεσιμότητα (ό,τι δήλωσε ο χρήστης για το 8×8). */
export const DEFAULT_AVAILABILITY = [
  'Πεμ | Γήπ. 4 | 21:15, 22:30',
  'Παρ | Γήπ. 3, Γήπ. 4 | 19:15, 20:30, 22:00',
  'Σαβ, Κυρ | Γήπ. 3, Γήπ. 4 | 16:00, 17:30, 19:00, 20:30, 22:00',
].join('\n')

import { athensDateKey } from '@/lib/time'

// Αυτόματος υπολογισμός ελεύθερων γηπέδων (πιστών) ΑΠΟΚΛΕΙΣΤΙΚΑ από τους
// υπάρχοντες αγώνες — χωρίς χειροκίνητη καταχώρηση ή ρύθμιση γεννήτριας.
//
// Λογική (ανά ΗΜΕΡΑ):
//   • «Ενεργές πίστες» της ημέρας = όσες πίστες έχουν έστω έναν αγώνα εκείνη τη μέρα.
//   • «Ώρες» της ημέρας = οι ώρες που όντως παίζονται αγώνες εκείνη τη μέρα.
//   • Για κάθε ενεργή πίστα × ώρα που ΔΕΝ έχει αγώνα → «ΕΛΕΥΘΕΡΟ».
//
// Έτσι μια Πέμπτη που παίζει μόνο το Γήπ.4 (21:15, 22:30) δεν βγάζει ποτέ
// ελεύθερα σε Γήπ.3/5 (δεν είναι ενεργά εκείνη τη μέρα), ενώ μια Παρασκευή που
// παίζουν 3/4/5 βγάζει ως ελεύθερα τα πραγματικά κενά ανάμεσά τους.

export type FreeSlot = { iso: string; field: string | null; venue: string | null }

type MatchLite = { field: string | null; match_date: string | null }
type VenueLite = { name: string; fields: string[] | null }

const key = (f: string | null, iso: string) => `${f ?? ''}|${new Date(iso).getTime()}`

export function computeFreeSlots(matches: MatchLite[], venues: VenueLite[]): FreeSlot[] {
  // «Πιασμένα» (πίστα + ώρα) από πραγματικούς αγώνες
  const booked = new Set<string>()
  for (const m of matches) if (m.match_date) booked.add(key(m.field, m.match_date))

  // πίστα → όνομα γηπέδου (για εμφάνιση)
  const fieldVenue = new Map<string, string>()
  for (const v of venues) for (const f of v.fields ?? []) if (!fieldVenue.has(f)) fieldVenue.set(f, v.name)

  // Ομαδοποίηση ανά ημέρα: ενεργές πίστες + ώρες
  const byDay = new Map<string, { fields: Set<string>; times: Set<number> }>()
  for (const m of matches) {
    if (!m.field || !m.match_date) continue
    const dk = athensDateKey(m.match_date)
    if (!byDay.has(dk)) byDay.set(dk, { fields: new Set(), times: new Set() })
    const d = byDay.get(dk)!
    d.fields.add(m.field)
    d.times.add(new Date(m.match_date).getTime())
  }

  const out: FreeSlot[] = []
  for (const d of byDay.values()) {
    for (const t of d.times) {
      const iso = new Date(t).toISOString()
      for (const f of d.fields) {
        if (!booked.has(key(f, iso)))
          out.push({ iso, field: f, venue: fieldVenue.get(f) ?? null })
      }
    }
  }
  return out
}

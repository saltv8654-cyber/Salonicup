// Αυτόματος υπολογισμός ελεύθερων γηπέδων (πιστών).
// Ιδέα: για κάθε ώρα που όντως παίζεται αγώνας σε ένα γήπεδο (venue), κάθε
// άλλη πίστα του ίδιου γηπέδου που ΔΕΝ έχει αγώνα εκείνη την ώρα θεωρείται
// «ΕΛΕΥΘΕΡΗ». Έτσι δεν χρειάζεται χειροκίνητη καταχώρηση κάθε βδομάδα — τα
// ελεύθερα προκύπτουν μόνα τους από το πρόγραμμα. Τα χειροκίνητα slots
// (πίνακας «slots») προστίθενται από πάνω (π.χ. για εντελώς άδειες βραδιές).

export type FreeSlot = { iso: string; field: string | null; venue: string | null }

type MatchLite = { field: string | null; match_date: string | null }
type SlotLite = { field: string | null; starts_at: string; venue?: { name?: string | null } | null }
type VenueLite = { name: string; fields: string[] | null }

const key = (f: string | null, iso: string) => `${f ?? ''}|${new Date(iso).getTime()}`

export function computeFreeSlots(
  matches: MatchLite[],
  slots: SlotLite[],
  venues: VenueLite[],
): FreeSlot[] {
  // «Πιασμένα» (γήπεδο-πίστα + ώρα) από πραγματικά ματς
  const booked = new Set<string>()
  for (const m of matches) if (m.match_date) booked.add(key(m.field, m.match_date))

  // πίστα → όνομα γηπέδου, και γήπεδο → πίστες
  const fieldVenue = new Map<string, string>()
  const venueFields = new Map<string, string[]>()
  for (const v of venues) {
    venueFields.set(v.name, v.fields ?? [])
    for (const f of v.fields ?? []) if (!fieldVenue.has(f)) fieldVenue.set(f, v.name)
  }

  const out = new Map<string, FreeSlot>()  // dedupe ανά πίστα+ώρα

  // 1) Χειροκίνητα slots που είναι ελεύθερα
  for (const s of slots) {
    if (booked.has(key(s.field, s.starts_at))) continue
    const k = key(s.field, s.starts_at)
    if (!out.has(k))
      out.set(k, {
        iso: s.starts_at,
        field: s.field,
        venue: s.venue?.name ?? (s.field ? fieldVenue.get(s.field) ?? null : null),
      })
  }

  // 2) Αυτόματα: ανά γήπεδο, οι ώρες προκύπτουν από τους αγώνες του ίδιου γηπέδου
  const venueTimes = new Map<string, Set<number>>()
  for (const m of matches) {
    if (!m.field || !m.match_date) continue
    const vn = fieldVenue.get(m.field)
    if (!vn) continue
    if (!venueTimes.has(vn)) venueTimes.set(vn, new Set())
    venueTimes.get(vn)!.add(new Date(m.match_date).getTime())
  }
  for (const [vn, insts] of venueTimes) {
    const fields = venueFields.get(vn) ?? []
    for (const t of insts) {
      const iso = new Date(t).toISOString()
      for (const f of fields) {
        const k = key(f, iso)
        if (!booked.has(k) && !out.has(k))
          out.set(k, { iso, field: f, venue: vn })
      }
    }
  }

  return [...out.values()]
}

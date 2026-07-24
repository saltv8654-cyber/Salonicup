/** Διατάξεις μικρού γηπέδου (τερματοφύλακας + γραμμές από άμυνα προς επίθεση). */
export const FORMATIONS = ['3-3-1', '2-4-1', '2-3-1', '3-2-1']

export type Slot = { x: number; y: number }

/** Έγκυρη διάταξη τύπου «3-3-1» (μονοψήφια νούμερα, 2–5 γραμμές). */
export function validFormation(s: string): boolean {
  return /^[1-9](-[1-9]){1,4}$/.test(s.trim())
}

/** Πλήθος θέσεων (με τον τερματοφύλακα). */
export function slotCount(formation: string): number {
  return 1 + formation.split('-').reduce((s, d) => s + (parseInt(d) || 0), 0)
}

/** Συντεταγμένες θέσεων 0..1 για κάθετο γήπεδο· index 0 = τερματοφύλακας (κάτω). */
export function slotCoords(formation: string): Slot[] {
  const rows = formation.split('-').map(n => parseInt(n)).filter(n => n > 0)
  const slots: Slot[] = [{ x: 0.5, y: 0.9 }] // τερματοφύλακας
  const n = rows.length
  rows.forEach((count, ri) => {
    const y = n === 1 ? 0.4 : 0.72 - ri * (0.58 / (n - 1))
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0.5 : 0.15 + i * (0.7 / (count - 1))
      slots.push({ x, y })
    }
  })
  return slots
}

/** Φέρνει έναν πίνακα θέσεων στο σωστό μήκος για τη διάταξη (γεμίζει με null). */
export function normalizeLine(line: any, formation: string): (string | null)[] {
  const n = slotCount(formation)
  const arr: (string | null)[] = Array.isArray(line) ? line.slice(0, n) : []
  while (arr.length < n) arr.push(null)
  return arr
}

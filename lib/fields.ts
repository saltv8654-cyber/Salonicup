/**
 * Αντιστοίχιση γηπέδου → λογαριασμός κάμερας (Instagram), μόνο για τα posts.
 * Τα νούμερα γηπέδων δεν επικαλύπτονται μεταξύ γηπέδων:
 *   Γηπ 1 (Ζαγοράκη) → Saltv1     Γηπ 4 → Saltv1
 *   Γηπ 2 (Ζαγοράκη) → Saltv2     Γηπ 3 → Saltv2
 *                                 Γηπ 5 → Saltv3
 */
const SALT_BY_FIELD_NUMBER: Record<string, string> = {
  '1': 'Saltv1',
  '2': 'Saltv2',
  '3': 'Saltv2',
  '4': 'Saltv1',
  '5': 'Saltv3',
}

/** Ο λογαριασμός κάμερας για ένα γήπεδο, ή null αν δεν υπάρχει αντιστοίχιση. */
export function saltForField(field?: string | null): string | null {
  if (!field) return null
  const n = String(field).match(/\d+/)?.[0]
  return (n && SALT_BY_FIELD_NUMBER[n]) || null
}

/** Ετικέτα γηπέδου για τα posts: ο λογαριασμός κάμερας αν υπάρχει, αλλιώς το γήπεδο. */
export function fieldPostLabel(field?: string | null): string | undefined {
  if (!field) return undefined
  return saltForField(field) ?? field
}

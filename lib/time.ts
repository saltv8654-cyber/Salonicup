/* Ώρα/ημερομηνία πάντα σε ζώνη Ελλάδας — ανεξάρτητα αν τρέχει σε server (UTC) ή client. */
export const TZ = 'Europe/Athens'

const DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο']

/** «21:00» */
export function fmtTime(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('el-GR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/** «Κυριακή 20/7» */
export function fmtDay(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric',
  }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  // weekday number μέσω en-US για ασφαλή αντιστοίχιση
  const wdIdx = new Date(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  ).getDay()
  return `${DAYS[wdIdx]} ${g('day')}/${g('month')}`
}

/** «Κυρ 20/7 · 21:00» (σύντομο) */
export function fmtDateTime(iso?: string | null) {
  if (!iso) return ''
  return `${fmtDay(iso)} · ${fmtTime(iso)}`
}

/** Κλειδί ημέρας «YYYY-MM-DD» σε ζώνη Ελλάδας (για ομαδοποίηση). */
export function athensDateKey(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso))
}

/** UTC timestamptz → τιμή για <input type="datetime-local"> σε ώρα Ελλάδας. */
export function toDatetimeLocal(iso?: string | null) {
  if (!iso) return ''
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

/** True αν το iso είναι σήμερα (ζώνη Ελλάδας). */
export function isTodayAthens(iso?: string | null) {
  if (!iso) return false
  return athensDateKey(iso) === athensDateKey(new Date().toISOString())
}

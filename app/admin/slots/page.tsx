'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty, FieldBadge } from '@/app/ui'
import { Select, SaveBtn } from '../ui'
import { fmtTime, fmtDay, athensDateKey } from '@/lib/time'
import type { Venue } from '@/lib/types'
import toast from 'react-hot-toast'

type Slot = { slot_id: string; venue_id: string; field: string | null; starts_at: string }
type Match = { field: string | null; match_date: string }

const PRESET_TIMES = ['17:30', '18:00', '19:00', '20:00', '20:30', '21:00', '22:00', '22:15']

const since = () => new Date(Date.now() - 86400000).toISOString()
const bookKey = (f: string | null, iso: string) => `${f ?? ''}|${new Date(iso).getTime()}`

export default function AdminSlots() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [venues, setVenues] = useState<Venue[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [busy, setBusy] = useState(false)

  // Φόρμα
  const [venueId, setVenueId] = useState('')
  const [fields, setFields] = useState<string[]>([])
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [times, setTimes] = useState<string[]>([])
  const [custom, setCustom] = useState('')

  async function fetchAll() {
    const [{ data: vs }, { data: ss }, { data: ms }] = await Promise.all([
      supabase.from('venues').select('venue_id, name, fields').order('name'),
      supabase.from('slots').select('slot_id, venue_id, field, starts_at').gte('starts_at', since()).order('starts_at'),
      supabase.from('matches').select('field, match_date').not('match_date', 'is', null).gte('match_date', since()),
    ])
    setVenues(vs ?? [])
    setSlots(ss ?? [])
    setMatches((ms ?? []) as Match[])
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [])

  const venue = venues.find(v => v.venue_id === venueId)

  function pickVenue(id: string) {
    setVenueId(id)
    const v = venues.find(x => x.venue_id === id)
    setFields(v?.fields ?? [])
  }
  const toggle = (arr: string[], set: (v: string[]) => void, val: string) =>
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])

  function addCustom() {
    const t = custom.trim()
    if (!/^\d{1,2}:\d{2}$/.test(t)) return toast.error('Ώρα σε μορφή ΩΩ:ΛΛ')
    if (!times.includes(t)) setTimes(prev => [...prev, t].sort())
    setCustom('')
  }

  // Booked keys (γήπεδο+ώρα) από πραγματικά ματς → κρύβουμε «πιασμένα» slots
  const booked = useMemo(() => {
    const s = new Set<string>()
    for (const m of matches) s.add(bookKey(m.field, m.match_date))
    return s
  }, [matches])

  // Ελεύθερα slots (χωρίς ματς εκείνη την ώρα/γήπεδο), ομαδοποιημένα ανά μέρα
  const days = useMemo(() => {
    const vmap = new Map(venues.map(v => [v.venue_id, v.name]))
    const free = slots.filter(s => !booked.has(bookKey(s.field, s.starts_at)))
    const byDay = new Map<string, Slot[]>()
    for (const s of free) {
      const k = athensDateKey(s.starts_at)
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(s)
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => ({
      key: k,
      label: fmtDay(list[0].starts_at),
      list: list.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || (a.field ?? '').localeCompare(b.field ?? '')),
      vmap,
    }))
  }, [slots, booked, venues])

  async function save() {
    if (!venueId) return toast.error('Διάλεξε γήπεδο')
    if (!fields.length) return toast.error('Διάλεξε τουλάχιστον ένα γήπεδο (πίστα)')
    if (!times.length) return toast.error('Διάλεξε ώρες')
    setBusy(true)
    const [y, mo, d] = date.split('-').map(Number)
    const rows = fields.flatMap(f => times.map(t => {
      const [h, mi] = t.split(':').map(Number)
      return { venue_id: venueId, field: f, starts_at: new Date(y, mo - 1, d, h, mi).toISOString(), match_id: null }
    }))
    const { error } = await supabase.from('slots').upsert(rows, { onConflict: 'venue_id,field,starts_at' })
    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε: ' + error.message)
    toast.success(`Προστέθηκαν ${rows.length} ελεύθερες ώρες`)
    setTimes([])
    fetchAll()
  }

  async function del(id: string) {
    setSlots(prev => prev.filter(s => s.slot_id !== id))
    await supabase.from('slots').delete().eq('slot_id', id)
  }
  async function delDay(list: Slot[]) {
    if (!confirm(`Διαγραφή ${list.length} ελεύθερων ωρών αυτής της ημέρας;`)) return
    const ids = list.map(s => s.slot_id)
    setSlots(prev => prev.filter(s => !ids.includes(s.slot_id)))
    for (let i = 0; i < ids.length; i += 100)
      await supabase.from('slots').delete().in('slot_id', ids.slice(i, i + 100))
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-extrabold text-chalk">Ελεύθερες ώρες γηπέδων</h1>
        <p className="text-[11px] text-dim mt-0.5">Οι captains βλέπουν αυτές τις ώρες ως «ΕΛΕΥΘΕΡΟ» στη σελίδα Γήπεδα.</p>
      </div>

      {/* ── Φόρμα προσθήκης ── */}
      <div className="bg-turf rounded-2xl border border-chalk/[0.05] p-4 flex flex-col gap-3.5">
        <Select label="ΓΗΠΕΔΟ" value={venueId} onChange={pickVenue}
          options={venues.map(v => ({ value: v.venue_id, label: v.name }))} />

        {venue && (
          <div>
            <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">ΠΙΣΤΕΣ</label>
            {!venue.fields?.length ? (
              <p className="text-[11.5px] text-off">Το γήπεδο δεν έχει πίστες — πρόσθεσέ τες στα «Γήπεδα».</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {venue.fields.map(f => (
                  <button key={f} onClick={() => toggle(fields, setFields, f)}
                    className={`px-3 py-2 rounded-lg text-[12px] font-bold border
                      ${fields.includes(f) ? 'bg-brand text-chalk border-lit' : 'bg-chalk/[0.04] text-dim border-chalk/[0.06]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">ΗΜΕΡΟΜΗΝΙΑ</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm outline-none border border-chalk/[0.07] focus:border-lit/50" />
        </div>

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">ΩΡΕΣ</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[...new Set([...PRESET_TIMES, ...times])].sort().map(t => (
              <button key={t} onClick={() => toggle(times, setTimes, t)}
                className={`px-3 py-2 rounded-lg text-[12px] font-bold tnum border
                  ${times.includes(t) ? 'bg-brand text-chalk border-lit' : 'bg-chalk/[0.04] text-dim border-chalk/[0.06]'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="time" value={custom} onChange={e => setCustom(e.target.value)}
              className="flex-1 bg-chalk/[0.04] rounded-xl px-3.5 py-2.5 text-chalk text-sm outline-none border border-chalk/[0.07] focus:border-lit/50" />
            <button onClick={addCustom}
              className="px-4 rounded-xl bg-chalk/[0.06] text-silver text-[12.5px] font-bold">+ Ώρα</button>
          </div>
        </div>

        <SaveBtn busy={busy} onClick={save} label="Προσθήκη ελεύθερων ωρών" />
      </div>

      {/* ── Λίστα ελεύθερων ── */}
      <div>
        <p className="text-[12.5px] font-extrabold text-chalk mb-2 px-1">Επόμενες ελεύθερες ώρες</p>
        {!days.length ? <Empty>Δεν υπάρχουν καταχωρημένες ελεύθερες ώρες.</Empty> : (
          <div className="flex flex-col gap-3">
            {days.map(d => (
              <div key={d.key}>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit">{d.label}</p>
                  <button onClick={() => delDay(d.list)} className="text-[10px] font-bold text-danger">Διαγραφή ημέρας</button>
                </div>
                <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                  {d.list.map((s, i) => (
                    <div key={s.slot_id}
                      className={`flex items-center gap-2.5 px-3 py-2.5 ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                      <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">{fmtTime(s.starts_at)}</span>
                      <div className="shrink-0"><FieldBadge field={s.field} size="xs" /></div>
                      <span className="flex-1 min-w-0 text-[11px] text-dim truncate">{d.vmap.get(s.venue_id) ?? ''}</span>
                      <button onClick={() => del(s.slot_id)}
                        className="px-2.5 py-1.5 rounded-lg bg-danger/15 text-danger text-[11px] font-bold shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty, FieldBadge } from '@/app/ui'
import { SaveBtn } from '../ui'
import { fmtTime, fmtDay, athensDateKey } from '@/lib/time'
import { computeFreeFromAvailability, DEFAULT_AVAILABILITY } from '@/lib/freeslots'
import toast from 'react-hot-toast'

type MatchLite = { field: string | null; match_date: string | null }
type VenueLite = { name: string; fields: string[] | null }

const since = () => new Date(Date.now() - 86400000).toISOString()

export default function AdminSlots() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState(DEFAULT_AVAILABILITY)
  const [venues, setVenues] = useState<VenueLite[]>([])
  const [matches, setMatches] = useState<MatchLite[]>([])

  async function fetchAll() {
    const [{ data: st }, { data: vs }, { data: ms }] = await Promise.all([
      supabase.from('app_settings').select('availability').eq('id', 1).maybeSingle(),
      supabase.from('venues').select('name, fields').order('name'),
      supabase.from('matches').select('field, match_date').not('match_date', 'is', null).gte('match_date', since()),
    ])
    setText(((st as any)?.availability as string) || DEFAULT_AVAILABILITY)
    setVenues(vs ?? [])
    setMatches((ms ?? []) as MatchLite[])
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [])

  // Ζωντανή προεπισκόπηση ελεύθερων (ίδιος υπολογισμός με captain/ημερολόγιο)
  const days = useMemo(() => {
    const free = computeFreeFromAvailability(text, matches, venues)
    const byDay = new Map<string, typeof free>()
    for (const s of free) {
      const k = athensDateKey(s.iso)
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(s)
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 21).map(([k, list]) => ({
      key: k,
      label: fmtDay(list[0].iso),
      list: list.sort((a, b) => a.iso.localeCompare(b.iso) || (a.field ?? '').localeCompare(b.field ?? '')),
    }))
  }, [text, matches, venues])

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('app_settings')
      .upsert({ id: 1, availability: text, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε: ' + error.message)
    toast.success('Αποθηκεύτηκε η διαθεσιμότητα')
  }

  if (load) return <Loading />

  const totalFree = days.reduce((s, d) => s + d.list.length, 0)

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-extrabold text-chalk">Ελεύθερες ώρες γηπέδων</h1>
        <p className="text-[11px] text-dim mt-0.5">
          Δήλωσε ΜΙΑ φορά τη διαθεσιμότητα (μέρες · πίστες · ώρες). Τα «ΕΛΕΥΘΕΡΟ» βγαίνουν
          αυτόματα = διαθεσιμότητα − αγώνες, κάθε βδομάδα, χωρίς να ξαναγράφεις τίποτα.
        </p>
      </div>

      {/* Επεξεργαστής διαθεσιμότητας */}
      <div className="bg-turf rounded-2xl border border-chalk/[0.05] p-4 flex flex-col gap-3">
        <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] pl-0.5">
          ΔΙΑΘΕΣΙΜΟΤΗΤΑ — μία γραμμή ανά κανόνα
        </label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
          className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-[13px]
            font-mono leading-relaxed outline-none border border-chalk/[0.07] focus:border-lit/50" />
        <div className="text-[10.5px] text-off leading-relaxed">
          <p className="font-bold text-silver mb-1">Μορφή: <span className="font-mono">μέρες | πίστες | ώρες</span></p>
          <p>• Μέρες: Δευ Τρι Τετ Πεμ Παρ Σαβ Κυρ (χώρισέ τες με κόμμα)</p>
          <p>• Πίστες &amp; ώρες: με κόμμα. Παράδειγμα:</p>
          <p className="font-mono mt-1 text-dim">Σαβ, Κυρ | Γήπ. 3, Γήπ. 4 | 16:00, 17:30, 19:00</p>
          <p className="mt-1.5">Για το 7×7 πρόσθεσε δικές του γραμμές (π.χ. <span className="font-mono">Παρ | Γήπ. 5 | 20:30, 22:00</span>).</p>
        </div>
        <SaveBtn busy={busy} onClick={save} label="Αποθήκευση διαθεσιμότητας" />
      </div>

      {/* Ζωντανή προεπισκόπηση */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[12.5px] font-extrabold text-chalk">Προεπισκόπηση ελεύθερων</p>
          <span className="text-[10px] text-dim font-bold">{totalFree} ελεύθερα</span>
        </div>
        {!days.length ? (
          <Empty>Δεν προκύπτουν ελεύθερα — έλεγξε μέρες/πίστες/ώρες ή πρόσθεσε αγώνες.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {days.map(d => (
              <div key={d.key}>
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit mb-1.5 px-1">
                  {d.label} <span className="text-dim font-bold">· {d.list.length}</span>
                </p>
                <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                  {d.list.map((s, i) => (
                    <div key={`${s.iso}-${s.field}`}
                      className={`flex items-center gap-2.5 px-3 py-2.5 ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                      <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">{fmtTime(s.iso)}</span>
                      <div className="shrink-0"><FieldBadge field={s.field} size="xs" /></div>
                      <span className="flex-1 min-w-0 text-[11px] text-off truncate">{s.venue ?? ''}</span>
                      <span className="text-[10.5px] font-extrabold text-lit shrink-0">ΕΛΕΥΘΕΡΟ</span>
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

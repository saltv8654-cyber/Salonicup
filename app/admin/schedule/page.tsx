'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty, FieldBadge } from '@/app/ui'
import { athensDateKey, fmtDay, fmtTime } from '@/lib/time'
import toast from 'react-hot-toast'

export default function AdminSchedule() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [load, setLoad] = useState(true)
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    supabase.from('matches')
      .select(`match_id, match_date, field, match_status,
        team_a_data:team_a(name), team_b_data:team_b(name), league:league_id(name)`)
      .not('match_date', 'is', null)
      .order('match_date', { ascending: true })
      .then(({ data }) => { setRows(data ?? []); setLoad(false) })
  }, [])

  const days = useMemo(() => {
    const todayKey = athensDateKey(new Date().toISOString())
    const byDay = new Map<string, any[]>()
    for (const m of rows) {
      const k = athensDateKey(m.match_date)
      if (!showPast && k < todayKey) continue
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(m)
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, ms]) => ({
        key,
        label: fmtDay(ms[0].match_date),
        matches: ms.slice().sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? '')),
      }))
  }, [rows, showPast])

  function copyDay(d: { label: string; matches: any[] }) {
    const lines = d.matches.map(m => {
      const t = fmtTime(m.match_date)
      const f = m.field ? ` · ${m.field}` : ''
      const lg = m.league?.name ? ` (${m.league.name})` : ''
      return `${t}${f} — ${m.team_a_data?.name} - ${m.team_b_data?.name}${lg}`
    })
    const text = `📅 ${d.label}\n${lines.join('\n')}`
    navigator.clipboard?.writeText(text)
    toast.success('Αντιγράφηκε το πρόγραμμα')
  }

  // Σβήσιμο παλιών ελεύθερων γηπέδων (slots) πριν από ημερομηνία
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10)
  const [cutoff, setCutoff] = useState(todayIso)
  const [delBusy, setDelBusy] = useState(false)
  async function deleteOldSlots() {
    if (!cutoff) return
    if (!confirm(`Σβήσιμο όλων των γηπέδων (slots) πριν τις ${cutoff};`)) return
    setDelBusy(true)
    try {
      const iso = new Date(`${cutoff}T00:00:00`).toISOString()
      const { error } = await supabase.from('slots').delete().lt('starts_at', iso)
      if (error) throw error
      toast.success('Σβήστηκαν τα παλιά γήπεδα')
    } catch (e: any) {
      toast.error(e?.message ?? 'Απέτυχε')
    } finally { setDelBusy(false) }
  }

  // Καθαρισμός: σβήνει ματς & slots με «σκουπίδι»-ώρα (λεπτά εκτός :00/:30)
  const [cleaning, setCleaning] = useState(false)
  async function cleanupJunk() {
    if (!confirm('Σβήσιμο ματς & γηπέδων με μη-καθαρές ώρες (εκτός :00 και :30);')) return
    setCleaning(true)
    try {
      const badMin = (iso?: string | null) =>
        !!iso && ![0, 30].includes(new Date(iso).getUTCMinutes())

      const { data: ms } = await supabase.from('matches').select('match_id, match_date')
      const badM = (ms ?? []).filter(m => badMin(m.match_date)).map(m => m.match_id)
      const { data: ss } = await supabase.from('slots').select('slot_id, starts_at')
      const badS = (ss ?? []).filter(s => badMin(s.starts_at)).map(s => s.slot_id)

      for (let i = 0; i < badM.length; i += 100)
        await supabase.from('matches').delete().in('match_id', badM.slice(i, i + 100))
      for (let i = 0; i < badS.length; i += 100)
        await supabase.from('slots').delete().in('slot_id', badS.slice(i, i + 100))

      toast.success(`Σβήστηκαν ${badM.length} ματς & ${badS.length} γήπεδα`)
      const { data } = await supabase.from('matches')
        .select(`match_id, match_date, field, match_status,
          team_a_data:team_a(name), team_b_data:team_b(name), league:league_id(name)`)
        .not('match_date', 'is', null).order('match_date', { ascending: true })
      setRows(data ?? [])
    } catch (e: any) {
      toast.error(e?.message ?? 'Απέτυχε ο καθαρισμός')
    } finally { setCleaning(false) }
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-chalk">Πρόγραμμα γηπέδων</h1>
          <p className="text-[11.5px] text-dim mt-1">Ανά ημέρα & ώρα — για αποστολή στα γήπεδα.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cleanupJunk} disabled={cleaning}
            className="px-3 py-2 rounded-lg bg-danger/15 text-danger text-[11px] font-bold disabled:opacity-50">
            {cleaning ? '…' : '🧹 Καθαρισμός'}
          </button>
          <button onClick={() => setShowPast(v => !v)}
            className="px-3 py-2 rounded-lg bg-turf border border-chalk/[0.08] text-silver text-[11px] font-bold">
            {showPast ? 'Μόνο επόμενα' : 'Όλα'}
          </button>
        </div>
      </div>

      {/* Σβήσιμο παλιών ελεύθερων γηπέδων */}
      <div className="bg-turf rounded-xl p-3 border border-chalk/[0.05] flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-dim font-semibold shrink-0">Σβήσε γήπεδα πριν:</span>
        <input type="date" value={cutoff} onChange={e => setCutoff(e.target.value)}
          className="flex-1 min-w-[130px] bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px]
            outline-none border border-chalk/[0.07]" />
        <button onClick={deleteOldSlots} disabled={delBusy}
          className="px-3 py-2 rounded-lg bg-danger/15 text-danger text-[11px] font-bold disabled:opacity-50">
          {delBusy ? '…' : 'Σβήσε'}
        </button>
      </div>

      {!days.length ? <Empty>Δεν υπάρχουν προγραμματισμένοι αγώνες.</Empty> : (
        <div className="flex flex-col gap-4">
          {days.map(d => (
            <div key={d.key}>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit">
                  {d.label} · {d.matches.length} αγ.
                </p>
                <button onClick={() => copyDay(d)}
                  className="text-[10.5px] font-bold text-silver bg-turf border border-chalk/[0.08]
                    rounded-lg px-2.5 py-1.5">
                  📋 Αντιγραφή
                </button>
              </div>
              <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                {d.matches.map((m, i) => (
                  <div key={m.match_id}
                    className={`flex items-center gap-2.5 px-3 py-2.5
                      ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                    <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">
                      {fmtTime(m.match_date)}
                    </span>
                    {m.field
                      ? <div className="shrink-0"><FieldBadge field={m.field} size="xs" /></div>
                      : <span className="w-[70px] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-chalk truncate">
                        {m.team_a_data?.name} <span className="text-dim">–</span> {m.team_b_data?.name}
                      </p>
                      {m.league?.name && (
                        <p className="text-[9.5px] text-dim truncate">{m.league.name}</p>
                      )}
                    </div>
                    {m.match_status !== 'Scheduled' && (
                      <span className="text-[8.5px] font-extrabold text-off shrink-0">
                        {m.match_status === 'Live' ? 'LIVE'
                          : ['Played', 'Forfeit'].includes(m.match_status) ? 'ΤΕΛ'
                          : m.match_status === 'Postponed' ? 'ΑΝΑΒ' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

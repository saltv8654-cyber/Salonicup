'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty, FieldBadge } from '@/app/ui'
import { athensDateKey, fmtDay, fmtTime } from '@/lib/time'
import toast from 'react-hot-toast'

/** Δευτέρα της εβδομάδας μιας ημερομηνίας → 'YYYY-MM-DD'. */
function mondayStr(d: Date) {
  const x = new Date(d); const wd = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - wd)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
function addDaysStr(s: string, n: number) {
  const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dm = (s: string) => { const [, m, d] = s.split('-'); return `${parseInt(d)}/${parseInt(m)}` }

export default function AdminSchedule() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [load, setLoad] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const [weekStart, setWeekStart] = useState(() => mondayStr(new Date()))

  // Πρωταθλήματα & αγωνιστικές (για διαγραφή)
  const [leagues, setLeagues] = useState<any[]>([])
  const [roundInfo, setRoundInfo] = useState<Record<string, number[]>>({})

  // Προσωπικό: σπίκερ (χρήστες) ανά ματς · φωτογράφος & social (staff) ανά μέρα
  const [staff, setStaff] = useState<{ id: string; name: string; kind: string }[]>([])
  const [speakers, setSpeakers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([])
  const [dayStaff, setDayStaff] = useState<Record<string, string>>({}) // `${day}|${role}` → staff_id
  async function loadStaff() {
    const [s, d, sp] = await Promise.all([
      supabase.from('staff').select('id, name, kind').order('name'),
      supabase.from('day_staff').select('day, role, staff_id'),
      supabase.from('profiles').select('id, full_name, email')
        .in('role', ['admin', 'speaker']).order('full_name'),
    ])
    setStaff(s.data ?? [])
    setSpeakers(sp.data ?? [])
    const map: Record<string, string> = {}
    for (const r of d.data ?? []) map[`${r.day}|${r.role}`] = r.staff_id
    setDayStaff(map)
  }
  async function setDayAssign(day: string, role: 'photographer' | 'social', staffId: string) {
    const k = `${day}|${role}`
    if (!staffId) {
      const { error } = await supabase.from('day_staff').delete().eq('day', day).eq('role', role)
      if (error) return toast.error('Δεν αποθηκεύτηκε')
      setDayStaff(prev => { const n = { ...prev }; delete n[k]; return n })
    } else {
      const { error } = await supabase.from('day_staff')
        .upsert({ day, role, staff_id: staffId }, { onConflict: 'day,role' })
      if (error) return toast.error('Δεν αποθηκεύτηκε')
      setDayStaff(prev => ({ ...prev, [k]: staffId }))
    }
  }

  async function loadRows() {
    const { data } = await supabase.from('matches')
      .select(`match_id, match_date, field, match_status, speaker_id, referee_id,
        team_a_data:team_a(name), team_b_data:team_b(name), league:league_id(name)`)
      .not('match_date', 'is', null)
      .order('match_date', { ascending: true })
    setRows(data ?? [])
  }

  // Ανάθεση σπίκερ/διαιτητή σε ΕΝΑΝ αγώνα (αλλάζουν ανά ματς)
  async function setMatchAssign(matchId: string, key: 'speaker_id' | 'referee_id', value: string) {
    const { error } = await supabase.from('matches')
      .update({ [key]: value || null }).eq('match_id', matchId)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    setRows(prev => prev.map(m => m.match_id === matchId ? { ...m, [key]: value || null } : m))
  }

  async function loadRounds() {
    const { data } = await supabase.from('matches').select('league_id, round')
    const map: Record<string, Set<number>> = {}
    for (const m of data ?? []) {
      if (m.round == null) continue
      ;(map[m.league_id] ??= new Set()).add(m.round)
    }
    const out: Record<string, number[]> = {}
    for (const k in map) out[k] = [...map[k]].sort((a, b) => a - b)
    setRoundInfo(out)
  }

  useEffect(() => {
    Promise.all([
      loadRows(),
      loadRounds(),
      loadStaff(),
      supabase.from('leagues').select('league_id, name').order('sort_order')
        .then(({ data }) => {
          setLeagues(data ?? [])
          if (data?.length) setDelLeague(data[0].league_id)
        }),
    ]).finally(() => setLoad(false))
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

  // Σβήσιμο αγωνιστικών (ανά πρωτάθλημα, εύρος από–έως)
  const [delLeague, setDelLeague] = useState('')
  const [rFrom, setRFrom] = useState('')
  const [rTo, setRTo] = useState('')
  const [rBusy, setRBusy] = useState(false)
  const availRounds = roundInfo[delLeague] ?? []

  async function deleteRounds() {
    const from = parseInt(rFrom)
    if (!delLeague || isNaN(from)) return toast.error('Διάλεξε πρωτάθλημα & αγωνιστική')
    const toNum = rTo.trim() ? parseInt(rTo) : from
    const lo = Math.min(from, toNum), hi = Math.max(from, toNum)
    const lg = leagues.find(l => l.league_id === delLeague)?.name ?? ''
    setRBusy(true)
    try {
      const { data: ms, error } = await supabase.from('matches')
        .select('match_id').eq('league_id', delLeague).gte('round', lo).lte('round', hi)
      if (error) throw error
      const ids = (ms ?? []).map(m => m.match_id)
      if (!ids.length) { toast('Δεν βρέθηκαν αγώνες σε αυτές τις αγωνιστικές'); return }
      const label = lo === hi ? `την αγωνιστική ${lo}` : `τις αγωνιστικές ${lo}–${hi}`
      if (!confirm(`Σβήσιμο ${ids.length} αγώνων — ${label} (${lg});\nΘα διαγραφούν και τα γκολ/γεγονότα τους. Μη αναστρέψιμο.`)) return

      // πρώτα τα events (γκολ/κάρτες), μετά τους αγώνες
      for (let i = 0; i < ids.length; i += 100)
        await supabase.from('events').delete().in('match_id', ids.slice(i, i + 100))
      for (let i = 0; i < ids.length; i += 100) {
        const { error: de } = await supabase.from('matches').delete().in('match_id', ids.slice(i, i + 100))
        if (de) throw de
      }
      toast.success(`Σβήστηκαν ${ids.length} αγώνες`)
      setRFrom(''); setRTo('')
      await Promise.all([loadRows(), loadRounds()])
    } catch (e: any) {
      toast.error(e?.message ?? 'Απέτυχε η διαγραφή')
    } finally { setRBusy(false) }
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

      {/* Εικόνα προγράμματος (Δευτ–Κυρ) με σπίκερ & διαιτητή */}
      <div className="bg-turf rounded-xl p-3 border border-chalk/[0.05] flex flex-col gap-2">
        <span className="text-[11px] text-dim font-semibold">📷 Αποθήκευση προγράμματος ως εικόνα (με σπίκερ & διαιτητή):</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setWeekStart(w => addDaysStr(w, -7))}
            className="px-3 py-2 rounded-lg bg-chalk/[0.05] border border-chalk/[0.08] text-silver text-[13px] font-bold">◀</button>
          <span className="flex-1 min-w-[120px] text-center text-[12.5px] font-extrabold text-chalk tnum">
            {dm(weekStart)} – {dm(addDaysStr(weekStart, 6))}
          </span>
          <button onClick={() => setWeekStart(w => addDaysStr(w, 7))}
            className="px-3 py-2 rounded-lg bg-chalk/[0.05] border border-chalk/[0.08] text-silver text-[13px] font-bold">▶</button>
          <button onClick={() => setWeekStart(mondayStr(new Date()))}
            className="px-3 py-2 rounded-lg bg-chalk/[0.05] border border-chalk/[0.08] text-dim text-[11px] font-bold">Τώρα</button>
        </div>
        <a href={`/api/og/program?start=${weekStart}`} target="_blank" rel="noopener noreferrer"
          className="block text-center px-3 py-2.5 rounded-lg bg-gradient-to-b from-lit to-brand
            text-white text-[13px] font-extrabold">
          📷 Άνοιγμα εικόνας
        </a>
        <p className="text-[10px] text-off">
          Ανοίγει σε νέα καρτέλα — στο κινητό κράτα πατημένη την εικόνα → «Αποθήκευση», στον υπολογιστή δεξί κλικ → «Αποθήκευση εικόνας».
        </p>
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

      {/* Σβήσιμο αγωνιστικών */}
      <div className="bg-turf rounded-xl p-3 border border-chalk/[0.05] flex flex-col gap-2">
        <span className="text-[11px] text-dim font-semibold">Σβήσε αγωνιστικές (αγώνες + γκολ):</span>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={delLeague} onChange={e => setDelLeague(e.target.value)}
            className="flex-1 min-w-[150px] bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px]
              outline-none border border-chalk/[0.07]">
            {leagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name}</option>)}
          </select>
          <input type="number" inputMode="numeric" value={rFrom} onChange={e => setRFrom(e.target.value)}
            placeholder="από"
            className="w-[68px] bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px] tnum
              outline-none border border-chalk/[0.07]" />
          <span className="text-dim text-[13px]">–</span>
          <input type="number" inputMode="numeric" value={rTo} onChange={e => setRTo(e.target.value)}
            placeholder="έως"
            className="w-[68px] bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px] tnum
              outline-none border border-chalk/[0.07]" />
          <button onClick={deleteRounds} disabled={rBusy}
            className="px-3 py-2 rounded-lg bg-danger/15 text-danger text-[11px] font-bold disabled:opacity-50">
            {rBusy ? '…' : 'Σβήσε'}
          </button>
        </div>
        <p className="text-[10px] text-dim">
          {availRounds.length
            ? <>Υπάρχουν αγωνιστικές: {availRounds.join(', ')}. Άφησε το «έως» κενό για μία μόνο.</>
            : 'Δεν υπάρχουν αγωνιστικές σε αυτό το πρωτάθλημα.'}
        </p>
      </div>

      {!days.length ? <Empty>Δεν υπάρχουν προγραμματισμένοι αγώνες.</Empty> : (
        <div className="flex flex-col gap-4">
          {days.map(d => {
            const photogs = staff.filter(s => s.kind === 'photographer')
            const socials = staff.filter(s => s.kind === 'social')
            const daySelect = (role: 'photographer' | 'social', icon: string, list: typeof staff) => (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-[13px] shrink-0">{icon}</span>
                <select value={dayStaff[`${d.key}|${role}`] ?? ''}
                  onChange={e => setDayAssign(d.key, role, e.target.value)}
                  className="flex-1 min-w-0 bg-chalk/[0.04] rounded-lg px-2 py-1.5 text-chalk text-[11.5px]
                    font-semibold outline-none border border-chalk/[0.07]">
                  <option value="">— κανείς —</option>
                  {list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )
            return (
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
              {/* Φωτογράφος & Social — για όλα τα ματς της μέρας */}
              <div className="flex items-center gap-2 mb-2 px-0.5">
                {daySelect('photographer', '📷', photogs)}
                {daySelect('social', '📱', socials)}
              </div>
              <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                {d.matches.map((m, i) => (
                  <div key={m.match_id} className={i ? 'border-t border-chalk/[0.05]' : ''}>
                    <Link href={`/match/${m.match_id}`}
                      className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5 active:bg-[#1C1C22]">
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
                      {m.match_status !== 'Scheduled' ? (
                        <span className="text-[8.5px] font-extrabold text-off shrink-0">
                          {m.match_status === 'Live' ? 'LIVE'
                            : ['Played', 'Forfeit'].includes(m.match_status) ? 'ΤΕΛ'
                            : m.match_status === 'Postponed' ? 'ΑΝΑΒ' : ''}
                        </span>
                      ) : <span className="text-dim text-xs shrink-0">›</span>}
                    </Link>
                    {/* Σπίκερ & Διαιτητής — ανά αγώνα */}
                    <div className="flex items-center gap-2 px-3 pb-2.5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[12px] shrink-0">🎙</span>
                        <select value={m.speaker_id ?? ''}
                          onChange={e => setMatchAssign(m.match_id, 'speaker_id', e.target.value)}
                          className={`flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold
                            outline-none border ${m.speaker_id
                              ? 'bg-lit/[0.12] border-lit/40 text-lit'
                              : 'bg-chalk/[0.04] border-chalk/[0.07] text-silver'}`}>
                          <option value="">— σπίκερ —</option>
                          {speakers.map(p => (
                            <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[12px] shrink-0">🟨</span>
                        <select value={m.referee_id ?? ''}
                          onChange={e => setMatchAssign(m.match_id, 'referee_id', e.target.value)}
                          className={`flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold
                            outline-none border ${m.referee_id
                              ? 'bg-[#F2C230]/[0.14] border-[#F2C230]/40 text-[#F2C230]'
                              : 'bg-chalk/[0.04] border-chalk/[0.07] text-silver'}`}>
                          <option value="">— διαιτητής —</option>
                          {staff.filter(s => s.kind === 'referee').map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Crest, Loading } from '@/app/ui'
import toast from 'react-hot-toast'

export default function AdminDraw() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [leagues, setLeagues] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [league, setLeague] = useState('')
  const [slots, setSlots] = useState<Record<number, string | null>>({})   // slot → team_id
  const chan = useRef<any>(null)
  const [copied, setCopied] = useState(false)

  async function fetchBase() {
    const [l, t] = await Promise.all([
      supabase.from('leagues').select('league_id, name, logo_url').eq('is_cup', false).order('sort_order'),
      supabase.from('teams').select('team_id, name, logo_url, league_id').eq('active', true).order('name'),
    ])
    setLeagues(l.data ?? [])
    setTeams(t.data ?? [])
    if (!league && l.data?.length) setLeague(l.data[0].league_id)
    setLoad(false)
  }
  useEffect(() => { fetchBase() }, [])

  const leagueTeams = useMemo(() => teams.filter(t => t.league_id === league), [teams, league])
  const N = leagueTeams.length
  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.team_id, t])), [teams])

  // Φόρτωσε αποθηκευμένες θέσεις + σύνδεσε κανάλι broadcast
  useEffect(() => {
    if (!league) return
    supabase.from('draw_slots').select('slot, team_id').eq('league_id', league).then(({ data }) => {
      const m: Record<number, string | null> = {}
      for (const r of data ?? []) m[r.slot] = r.team_id
      setSlots(m)
    })
    chan.current?.unsubscribe()
    chan.current = supabase.channel(`draw-${league}`)
    chan.current.subscribe()
    return () => { chan.current?.unsubscribe() }
  }, [league])

  function broadcast(next: Record<number, string | null>) {
    chan.current?.send({
      type: 'broadcast', event: 'draw',
      payload: { slots: next },
    })
  }

  async function assign(slot: number, teamId: string | null) {
    const next = { ...slots, [slot]: teamId }
    setSlots(next)
    broadcast(next)
    await supabase.from('draw_slots')
      .upsert({ league_id: league, slot, team_id: teamId, updated_at: new Date().toISOString() },
        { onConflict: 'league_id,slot' })
  }

  async function resetAll() {
    if (!confirm('Καθαρισμός κλήρωσης αυτού του πρωταθλήματος;')) return
    setSlots({}); broadcast({})
    await supabase.from('draw_slots').delete().eq('league_id', league)
  }

  const assignedIds = new Set(Object.values(slots).filter(Boolean) as string[])
  const remaining = leagueTeams.filter(t => !assignedIds.has(t.team_id))

  function copyOverlay() {
    const url = `${window.location.origin}/overlay/draw/${league}`
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      .catch(() => toast.error('Δεν αντιγράφηκε'))
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-chalk">🎬 Κλήρωση</h1>
        <button onClick={resetAll}
          className="px-3 py-1.5 rounded-lg bg-danger/15 border border-danger/30 text-danger text-[11px] font-bold">
          Καθαρισμός
        </button>
      </div>

      <select value={league} onChange={e => setLeague(e.target.value)}
        className="w-full bg-turf rounded-xl px-3.5 py-3 text-chalk text-sm outline-none border border-chalk/[0.07]">
        {leagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name}</option>)}
      </select>

      <button onClick={copyOverlay}
        className="w-full py-2.5 rounded-xl bg-turf border border-lit/25 text-lit text-[12.5px] font-extrabold">
        {copied ? '✓ Αντιγράφηκε' : '📺 Αντιγραφή link overlay (OBS)'}
      </button>

      <p className="text-[11px] text-dim -mt-1">
        Άνοιξε το overlay ως Browser Source (1920×1080). Τράβα μπαλάκι → διάλεξε την ομάδα στη θέση.
        Εμφανίζεται ζωντανά δεξιά· η αριστερή μισή οθόνη μένει διάφανη για την κάμερα.
      </p>

      <div className="flex flex-col gap-1.5">
        {Array.from({ length: N }, (_, i) => i + 1).map(slot => {
          const tid = slots[slot] ?? null
          const t = tid ? teamById[tid] : null
          return (
            <div key={slot} className="bg-turf rounded-xl border border-chalk/[0.05] px-3 py-2.5 flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-lit/[0.14] grid place-items-center text-[13px] font-black text-lit shrink-0">
                {slot}
              </span>
              {t ? (
                <>
                  <Crest url={t.logo_url} name={t.name} size={26} />
                  <span className="flex-1 text-[13.5px] font-bold text-chalk truncate">{t.name}</span>
                  <button onClick={() => assign(slot, null)}
                    className="px-2.5 py-1.5 rounded-lg bg-chalk/[0.06] text-silver text-[11px] font-bold">Αλλαγή</button>
                </>
              ) : (
                <select value="" onChange={e => e.target.value && assign(slot, e.target.value)}
                  className="flex-1 bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px] outline-none border border-chalk/[0.07]">
                  <option value="">— διάλεξε ομάδα —</option>
                  {remaining.map(rt => <option key={rt.team_id} value={rt.team_id}>{rt.name}</option>)}
                </select>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-dim text-center">
        {assignedIds.size}/{N} κληρώθηκαν · απομένουν {remaining.length}
      </p>
    </div>
  )
}

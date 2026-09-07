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
  const leagueObj = leagues.find(l => l.league_id === league)
  // Ζευγάρια: slot 2p+1 (αριστερά) vs 2p+2 (δεξιά). Εμφανίζεται όσα έχουν έστω μία ομάδα.
  const previewPairs = Array.from({ length: Math.ceil(N / 2) }, (_, p) => ({
    n: p + 1,
    a: slots[2 * p + 1] ? teamById[slots[2 * p + 1] as string] : null,
    b: slots[2 * p + 2] ? teamById[slots[2 * p + 2] as string] : null,
  })).filter(x => x.a || x.b)

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

      {/* Ζωντανή προεπισκόπηση overlay (16:9) */}
      <div>
        <p className="text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">ΠΡΟΕΠΙΣΚΟΠΗΣΗ OVERLAY</p>
        <div className="relative rounded-xl overflow-hidden border border-chalk/[0.08]"
          style={{ aspectRatio: '16 / 9', background: 'radial-gradient(120% 90% at 30% 55%, #2a3340 0%, #10151c 60%, #0a0d12 100%)' }}>
          {/* placeholder «κάμερα» αριστερά */}
          <div className="absolute left-[6%] bottom-2 text-[9px] text-silver/70 font-bold">🎥 κάμερα εδώ</div>
          {/* δεξιά μισή = το overlay */}
          <div className="absolute top-0 right-0 h-full flex flex-col p-3"
            style={{ width: '50%', background: 'linear-gradient(90deg, rgba(11,11,14,0) 0%, rgba(11,11,14,0.8) 14%, rgba(11,11,14,0.94) 100%)' }}>
            <div className="flex items-center gap-2 mb-2">
              {leagueObj?.logo_url
                ? <img src={leagueObj.logo_url} alt="" className="w-5 h-5 object-contain" />
                : <span className="text-[13px]">🏆</span>}
              <div className="leading-none">
                <div className="text-[5.5px] font-extrabold tracking-[0.14em] text-lit">SALONICUP · ΚΛΗΡΩΣΗ</div>
                <div className="text-[11px] font-extrabold text-chalk truncate">{leagueObj?.name ?? ''}</div>
              </div>
            </div>
            <div className="flex flex-col gap-[3px] overflow-hidden">
              {previewPairs.length === 0 ? (
                <div className="text-[8px] text-dim">Αναμονή κλήρωσης…</div>
              ) : previewPairs.slice(0, 6).map(pr => (
                <div key={pr.n} className="flex items-center gap-1 px-1.5 py-[3px] rounded-md"
                  style={{ background: 'rgba(255,255,255,0.05)', borderLeft: '2px solid #F5782E' }}>
                  <Crest url={pr.a?.logo_url} name={pr.a?.name} size={12} />
                  <span className="flex-1 text-[8px] font-extrabold text-chalk truncate text-right">{pr.a?.name ?? '—'}</span>
                  <span className="text-[6.5px] font-black text-lit shrink-0">VS</span>
                  <span className="flex-1 text-[8px] font-extrabold text-chalk truncate">{pr.b?.name ?? '—'}</span>
                  <Crest url={pr.b?.logo_url} name={pr.b?.name} size={12} />
                </div>
              ))}
              {previewPairs.length > 6 && (
                <div className="text-[7px] text-dim pl-1">+{previewPairs.length - 6} ζευγάρια…</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: Math.ceil(N / 2) }, (_, p) => {
          const slotA = 2 * p + 1, slotB = 2 * p + 2
          const SlotPick = ({ slot }: { slot: number }) => {
            if (slot > N) return <div className="flex-1" />
            const tid = slots[slot] ?? null
            const t = tid ? teamById[tid] : null
            return t ? (
              <button onClick={() => assign(slot, null)}
                className="flex-1 flex items-center gap-2 rounded-lg bg-chalk/[0.04] border border-chalk/[0.06] px-2.5 py-2 text-left active:bg-[#1C1C22]">
                <Crest url={t.logo_url} name={t.name} size={20} />
                <span className="flex-1 text-[12px] font-bold text-chalk truncate">{t.name}</span>
                <span className="text-[9px] text-off">↺</span>
              </button>
            ) : (
              <select value="" onChange={e => e.target.value && assign(slot, e.target.value)}
                className="flex-1 bg-chalk/[0.04] rounded-lg px-2.5 py-2 text-chalk text-[12px] outline-none border border-chalk/[0.07]">
                <option value="">— διάλεξε —</option>
                {remaining.map(rt => <option key={rt.team_id} value={rt.team_id}>{rt.name}</option>)}
              </select>
            )
          }
          return (
            <div key={p} className="bg-turf rounded-xl border border-chalk/[0.05] px-3 py-2.5">
              <div className="text-[8.5px] font-black text-lit tracking-wide mb-1.5">ΖΕΥΓΑΡΙ {p + 1}</div>
              <div className="flex items-center gap-2">
                <SlotPick slot={slotA} />
                <span className="text-[10px] font-black text-dim shrink-0">VS</span>
                <SlotPick slot={slotB} />
              </div>
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

'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Loading, Crest } from '@/app/ui'
import LineupPitch from '@/app/lineup-pitch'
import { FORMATIONS, slotCount } from '@/lib/formations'
import toast from 'react-hot-toast'

type Player = { player_id: string; full_name: string; number: number | null; photo_url: string | null; team_id: string }
type Team = { team_id: string; name: string; logo_url: string | null; league_id: string }
type Lg = { league_id: string; name: string; logo_url: string | null }

export function leagueAccent(name?: string): string {
  const n = (name || '').toLowerCase()
  if (n.includes('elite')) return '#F7B01B'
  if (n.includes('liga')) return '#FFE000'
  if (n.includes('master')) return '#2BD46E'
  if (n.includes('trophy')) return '#F0463A'
  if (n.includes('east')) return '#3A78FF'
  if (n.includes('summer')) return '#B14BFF'
  return '#E05B1F'
}

export default function TeamOfWeekBuilder() {
  const supabase = createClient()
  const { profile } = useAuth()
  const [load, setLoad] = useState(true)
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [leagues, setLeagues] = useState<Lg[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [formation, setFormation] = useState('3-3-1')
  const [title, setTitle] = useState('TEAM OF THE WEEK')
  const [round, setRound] = useState('')
  const [picks, setPicks] = useState<(string | null)[]>(Array(8).fill(null))
  const [active, setActive] = useState<number | null>(null)
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const [p, t, l] = await Promise.all([
        supabase.from('players').select('player_id, full_name, number, photo_url, team_id').order('number'),
        supabase.from('teams').select('team_id, name, logo_url, league_id'),
        supabase.from('leagues').select('league_id, name, logo_url').eq('active', true).order('sort_order'),
      ])
      setPlayers((p.data ?? []) as any)
      setTeams((t.data ?? []) as any)
      setLeagues((l.data ?? []) as any)
      if (l.data?.[0]) setLeagueId((l.data as any)[0].league_id)
      setLoad(false)
    })()
  }, [])

  // Κράτα το μήκος του picks ίσο με τις θέσεις της διάταξης
  useEffect(() => {
    const n = slotCount(formation)
    setPicks(prev => { const a = prev.slice(0, n); while (a.length < n) a.push(null); return a })
  }, [formation])

  // Φόρτωσε αποθηκευμένη 11άδα του πρωταθλήματος
  useEffect(() => {
    if (!leagueId) return
    supabase.from('team_of_week').select('*').eq('league_id', leagueId).maybeSingle()
      .then(({ data }: any) => {
        if (!data) { setPicks(Array(slotCount(formation)).fill(null)); setRound(''); return }
        if (data.formation) setFormation(data.formation)
        setTitle(data.title || 'TEAM OF THE WEEK')
        setRound(data.round != null ? String(data.round) : '')
        const n = slotCount(data.formation || formation)
        const arr = ((data.player_ids ?? []) as (string | null)[]).slice(0, n)
        while (arr.length < n) arr.push(null)
        setPicks(arr)
      })
    setOpenTeam(null); setActive(null)
  }, [leagueId])

  const pmap = useMemo(() => { const m: Record<string, Player> = {}; players.forEach(p => { m[p.player_id] = p }); return m }, [players])
  const leagueTeams = useMemo(() => teams.filter(t => t.league_id === leagueId).sort((a, b) => a.name.localeCompare(b.name)), [teams, leagueId])
  const playersOfTeam = (tid: string) => players.filter(p => p.team_id === tid)

  const league = leagues.find(l => l.league_id === leagueId)
  const accent = leagueAccent(league?.name)
  const sub = round ? `Αγωνιστική ${round}` : ''

  function placePlayer(id: string) {
    setPicks(prev => {
      if (prev.includes(id)) return prev.map(x => x === id ? null : x)
      const arr = [...prev]
      const slot = active != null ? active : arr.findIndex(x => x == null)
      if (slot < 0) { toast.error('Γέμισες τη διάταξη'); return prev }
      arr[slot] = id
      return arr
    })
    setActive(null)
  }
  function onSlot(i: number) {
    setPicks(prev => { if (prev[i]) { const a = [...prev]; a[i] = null; return a } return prev })
    setActive(a => (a === i ? null : i))
  }

  async function save() {
    if (!leagueId) { toast.error('Διάλεξε πρωτάθλημα'); return }
    setSaving(true)
    const { error } = await supabase.from('team_of_week').upsert({
      league_id: leagueId, round: round ? parseInt(round) : null, formation, title,
      player_ids: picks, updated_by: profile?.id ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'league_id' })
    setSaving(false)
    if (error) { toast.error('Δεν αποθηκεύτηκε: ' + error.message); return }
    toast.success('Αποθηκεύτηκε ✓')
  }

  function openImage(sizeKind: 'post' | 'story' = 'post') {
    const ids = picks.map(x => x ?? '').join(',')
    const u = `/api/og/toteam?ids=${encodeURIComponent(ids)}&formation=${formation}&size=${sizeKind}` +
      `&league=${encodeURIComponent(league?.name ?? '')}&leagueLogo=${encodeURIComponent(league?.logo_url ?? '')}` +
      `&title=${encodeURIComponent(title)}&sub=${encodeURIComponent(sub)}&accent=${encodeURIComponent(accent)}&_=${Date.now()}`
    window.open(u, '_blank')
  }

  if (load) return <Loading />
  const count = picks.filter(Boolean).length

  return (
    <div className="max-w-2xl mx-auto">
      {/* Πρωταθλήματα */}
      <div className="flex gap-2 overflow-x-auto pb-3">
        {leagues.map(l => {
          const on = l.league_id === leagueId
          return (
            <button key={l.league_id} onClick={() => setLeagueId(l.league_id)}
              className={`shrink-0 px-3.5 py-2 rounded-full text-[12px] font-bold whitespace-nowrap border
                ${on ? 'bg-brand text-chalk border-lit' : 'bg-turf text-dim border-chalk/[0.06]'}`}>
              {l.name}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <select value={formation} onChange={e => setFormation(e.target.value)}
          className="bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px]">
          {FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input value={round} onChange={e => setRound(e.target.value)} placeholder="Αγων." inputMode="numeric"
          className="w-24 bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px]" />
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="flex-1 min-w-[160px] bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px] font-bold" />
      </div>

      {/* Γήπεδο */}
      <div className="max-w-sm mx-auto mb-2">
        <LineupPitch formation={formation} line={picks} players={pmap} accent={accent} onSlot={onSlot} />
      </div>
      <div className="text-center text-[12px] text-silver mb-3">
        {active != null ? <span className="text-lit font-bold">Διάλεξε παίκτη για τη θέση {active + 1}</span>
          : <>Επιλεγμένοι <b className="text-chalk">{count}/{picks.length}</b> · πάτα θέση για άδειασμα</>}
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-3 mb-2 rounded-xl font-black text-[14px] text-chalk bg-chalk/[0.06] border border-chalk/10 disabled:opacity-50">
        {saving ? '…' : '💾 Αποθήκευση'}
      </button>
      <div className="flex gap-2 mb-5">
        <button onClick={() => openImage('post')} disabled={count === 0}
          className="flex-1 py-3 rounded-xl font-black text-[14px] text-white bg-gradient-to-b from-lit to-brand disabled:opacity-50">
          📸 Post
        </button>
        <button onClick={() => openImage('story')} disabled={count === 0}
          className="flex-1 py-3 rounded-xl font-black text-[14px] text-white bg-gradient-to-b from-lit to-brand disabled:opacity-50">
          📱 Story
        </button>
      </div>

      {/* Παίκτες ανά ομάδα */}
      <div className="text-[11px] font-black text-lit tracking-wider uppercase mb-2">Επιλογή ανά ομάδα</div>
      <div className="flex flex-col gap-1.5">
        {leagueTeams.map(t => {
          const roster = playersOfTeam(t.team_id)
          const open = openTeam === t.team_id
          const picked = roster.filter(p => picks.includes(p.player_id)).length
          return (
            <div key={t.team_id} className="rounded-xl bg-turf border border-chalk/[0.07] overflow-hidden">
              <button onClick={() => setOpenTeam(open ? null : t.team_id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5">
                <Crest url={t.logo_url} name={t.name} size={24} />
                <span className="flex-1 text-left text-[13px] font-bold text-chalk truncate">{t.name}</span>
                {picked > 0 && <span className="text-[11px] font-black text-lit">{picked} επιλ.</span>}
                <span className="text-dim text-[12px]">{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-1.5 border-t border-chalk/[0.06]">
                  {roster.length === 0 && <span className="text-[11px] text-dim col-span-2 py-1">Χωρίς παίκτες</span>}
                  {roster.map(p => {
                    const on = picks.includes(p.player_id)
                    return (
                      <button key={p.player_id} onClick={() => placePlayer(p.player_id)}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border text-left
                          ${on ? 'bg-brand/25 border-brand/50' : 'bg-chalk/[0.04] border-chalk/[0.07]'}`}>
                        <span className="w-6 h-6 rounded-full bg-chalk/[0.08] grid place-items-center text-[10px] font-black text-silver overflow-hidden shrink-0">
                          {p.photo_url ? <img src={p.photo_url} alt="" className="w-full h-full object-cover" /> : (p.number ?? p.full_name[0])}
                        </span>
                        <span className="text-[12px] font-semibold text-chalk truncate">{p.full_name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {leagueTeams.length === 0 && <div className="text-center text-dim text-[13px] py-8">Δεν υπάρχουν ομάδες σ' αυτό το πρωτάθλημα.</div>}
      </div>
    </div>
  )
}

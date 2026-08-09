'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Loading, Crest } from '@/app/ui'
import LineupPitch from '@/app/lineup-pitch'
import { slotCount } from '@/lib/formations'
import toast from 'react-hot-toast'

type Player = { player_id: string; full_name: string; number: number | null; photo_url: string | null; team_id: string }
type Team = { team_id: string; name: string; logo_url: string | null; league_id: string }
type Lg = { league_id: string; name: string; logo_url: string | null }

const FORMATION = '3-3-1'
const LABELS = ['GK', 'LB', 'CB', 'RB', 'LW', 'MF', 'RW', 'CF']

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

export default function TeamOfWeekBuilder({ mode = 'speaker' }: { mode?: 'speaker' | 'admin' }) {
  const supabase = createClient()
  const { profile } = useAuth()
  const isAdmin = mode === 'admin'
  const [load, setLoad] = useState(true)
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [leagues, setLeagues] = useState<Lg[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [title, setTitle] = useState('TEAM OF THE WEEK')
  const [round, setRound] = useState('')
  const [picks, setPicks] = useState<(string | null)[]>(Array(8).fill(null))
  const [active, setActive] = useState<number | null>(null)
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // admin: προτάσεις σπίκερ
  const [proposals, setProposals] = useState<{ speaker_id: string; player_ids: (string | null)[] }[]>([])
  const [names, setNames] = useState<Record<string, string>>({})

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

  // Φόρτωσε αποθηκευμένη 11άδα / πρόταση του πρωταθλήματος
  useEffect(() => {
    if (!leagueId || !profile?.id) return
    const q = isAdmin
      ? supabase.from('team_of_week').select('*').eq('league_id', leagueId).maybeSingle()
      : supabase.from('team_of_week_proposals').select('*').eq('league_id', leagueId).eq('speaker_id', profile.id).maybeSingle()
    q.then(({ data }: any) => {
      if (!data) { setPicks(Array(8).fill(null)); setRound('') }
      else {
        if (isAdmin && data.title) setTitle(data.title)
        setRound(data.round != null ? String(data.round) : '')
        const arr = ((data.player_ids ?? []) as (string | null)[]).slice(0, 8)
        while (arr.length < 8) arr.push(null)
        setPicks(arr)
      }
    })
    setOpenTeam(null); setActive(null)
    // admin: μάζεψε όλες τις προτάσεις των σπίκερ
    if (isAdmin) {
      supabase.from('team_of_week_proposals').select('speaker_id, player_ids').eq('league_id', leagueId)
        .then(async ({ data }: any) => {
          const props = (data ?? []) as any[]
          setProposals(props)
          const sids = props.map(p => p.speaker_id)
          if (sids.length) {
            const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', sids)
            const nm: Record<string, string> = {}
            ;(profs ?? []).forEach((pr: any) => { nm[pr.id] = pr.full_name || 'Σπίκερ' })
            setNames(nm)
          } else setNames({})
        })
    }
  }, [leagueId, profile?.id, isAdmin])

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
  function setSlot(i: number, id: string) { setPicks(prev => { const a = [...prev]; a[i] = id; return a }); setActive(null) }
  function onSlot(i: number) {
    setPicks(prev => { if (prev[i]) { const a = [...prev]; a[i] = null; return a } return prev })
    setActive(a => (a === i ? null : i))
  }

  async function save() {
    if (!leagueId || !profile?.id) { toast.error('Διάλεξε πρωτάθλημα'); return }
    setSaving(true)
    const { error } = isAdmin
      ? await supabase.from('team_of_week').upsert({
          league_id: leagueId, round: round ? parseInt(round) : null, formation: FORMATION, title,
          player_ids: picks, updated_by: profile.id, updated_at: new Date().toISOString(),
        }, { onConflict: 'league_id' })
      : await supabase.from('team_of_week_proposals').upsert({
          league_id: leagueId, speaker_id: profile.id, round: round ? parseInt(round) : null,
          player_ids: picks, updated_at: new Date().toISOString(),
        }, { onConflict: 'league_id,speaker_id' })
    setSaving(false)
    if (error) { toast.error('Δεν αποθηκεύτηκε: ' + error.message); return }
    toast.success(isAdmin ? 'Επίσημη ομάδα αποθηκεύτηκε ✓' : 'Η πρότασή σου αποθηκεύτηκε ✓')
  }

  function openImage(sizeKind: 'post' | 'story' = 'post') {
    const ids = picks.map(x => x ?? '').join(',')
    const u = `/api/og/toteam?ids=${encodeURIComponent(ids)}&formation=${FORMATION}&size=${sizeKind}` +
      `&league=${encodeURIComponent(league?.name ?? '')}&leagueLogo=${encodeURIComponent(league?.logo_url ?? '')}` +
      `&title=${encodeURIComponent(title)}&sub=${encodeURIComponent(sub)}&accent=${encodeURIComponent(accent)}&_=${Date.now()}`
    window.open(u, '_blank')
  }

  // admin: υποψήφιοι ανά θέση από τις προτάσεις
  const candidatesBySlot = useMemo(() => {
    const out: { pid: string; who: string[] }[][] = Array.from({ length: 8 }, () => [])
    proposals.forEach(pr => {
      (pr.player_ids ?? []).slice(0, 8).forEach((pid, i) => {
        if (!pid) return
        const list = out[i]
        const ex = list.find(c => c.pid === pid)
        const who = names[pr.speaker_id] || 'Σπίκερ'
        if (ex) ex.who.push(who); else list.push({ pid, who: [who] })
      })
    })
    return out
  }, [proposals, names])
  const hasProposals = proposals.length > 0

  if (load) return <Loading />
  const count = picks.filter(Boolean).length

  return (
    <div className="max-w-2xl mx-auto">
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
        <input value={round} onChange={e => setRound(e.target.value)} placeholder="Αγων." inputMode="numeric"
          className="w-24 bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px]" />
        {isAdmin && (
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="flex-1 min-w-[160px] bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px] font-bold" />
        )}
      </div>

      {/* Γήπεδο */}
      <div className="max-w-sm mx-auto mb-2">
        <LineupPitch formation={FORMATION} line={picks} players={pmap} accent={accent} onSlot={onSlot} />
      </div>
      <div className="text-center text-[12px] text-silver mb-3">
        {active != null ? <span className="text-lit font-bold">Διάλεξε παίκτη για {LABELS[active]}</span>
          : <>Επιλεγμένοι <b className="text-chalk">{count}/8</b> · πάτα θέση για άδειασμα</>}
      </div>

      <button onClick={save} disabled={saving}
        className={`w-full py-3 mb-2 rounded-xl font-black text-[14px] border disabled:opacity-50
          ${isAdmin ? 'text-white bg-gradient-to-b from-[#16a34a] to-[#0e7a3a] border-[#16a34a]'
            : 'text-chalk bg-chalk/[0.06] border-chalk/10'}`}>
        {saving ? '…' : isAdmin ? '✅ Αποθήκευση επίσημης ομάδας' : '💾 Αποθήκευση της πρότασής μου'}
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

      {!isAdmin && (
        <p className="text-[11px] text-dim leading-snug mb-4 -mt-2">
          Αυτή είναι η <b className="text-silver">δική σου πρόταση</b>. Την τελική ομάδα την ορίζει ο διαχειριστής.
        </p>
      )}

      {/* ADMIN: προτάσεις σπίκερ ανά θέση */}
      {isAdmin && hasProposals && (
        <div className="mb-5">
          <div className="text-[11px] font-black text-lit tracking-wider uppercase mb-2">
            Προτάσεις σπίκερ — διάλεξε τον τελικό ανά θέση</div>
          <div className="flex flex-col gap-1.5">
            {LABELS.map((lbl, i) => {
              const cands = candidatesBySlot[i]
              if (!cands.length) return null
              const conflict = cands.length > 1
              return (
                <div key={i} className="rounded-xl bg-turf border border-chalk/[0.07] p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-black text-chalk w-8">{lbl}</span>
                    {conflict && <span className="text-[9.5px] font-black text-[#e0563c] bg-[#e0563c]/15 px-2 py-0.5 rounded-full">ΔΙΑΦΩΝΙΑ</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cands.map(c => {
                      const pl = pmap[c.pid]
                      const chosen = picks[i] === c.pid
                      return (
                        <button key={c.pid} onClick={() => setSlot(i, c.pid)}
                          className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 border text-left
                            ${chosen ? 'bg-brand/30 border-brand' : 'bg-chalk/[0.04] border-chalk/[0.07]'}`}>
                          <span className="text-[12px] font-bold text-chalk">{pl?.full_name ?? '—'}</span>
                          <span className="text-[9.5px] text-dim">({c.who.join(', ')})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Crest, Loading, Empty } from '@/app/ui'
import { Modal, Field, Select, SaveBtn } from '../ui'
import { toDatetimeLocal } from '@/lib/time'
import toast from 'react-hot-toast'
import type { Team, League, Venue, MatchState } from '@/lib/types'

const STATUSES: { value: MatchState; label: string }[] = [
  { value: 'Scheduled', label: 'Προγραμματισμένος' },
  { value: 'Live',      label: 'Σε εξέλιξη' },
  { value: 'Played',    label: 'Ολοκληρωμένος' },
  { value: 'Postponed', label: 'Αναβλήθηκε' },
  { value: 'Forfeit',   label: 'Απουσία (0-0)' },
]

const STATUS_DOT: Record<string, string> = {
  Scheduled: '#8a8a93', Live: '#e0563c', Played: '#2FA84F',
  Postponed: '#c9a227', Forfeit: '#8a6d1f',
}

export default function AdminMatches() {
  const supabase = createClient()
  const [rows, setRows]       = useState<any[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [teams, setTeams]     = useState<Team[]>([])
  const [venues, setVenues]   = useState<Venue[]>([])
  const [filter, setFilter]   = useState('')
  const [load, setLoad]       = useState(true)
  const [open, setOpen]       = useState(false)
  const [edit, setEdit]       = useState<any>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleRound = (key: string) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  async function fetchAll() {
    const [m, l, t, v] = await Promise.all([
      supabase.from('matches').select(`
        *, team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url),
        league:league_id(name), venue:venue_id(name)
      `).order('round', { ascending: false }).order('match_date'),
      supabase.from('leagues').select('*').order('sort_order'),
      supabase.from('teams').select('*').order('name'),
      supabase.from('venues').select('*').order('name'),
    ])
    setRows(m.data ?? [])
    setLeagues(l.data ?? [])
    setTeams(t.data ?? [])
    setVenues(v.data ?? [])
    setLoad(false)
  }

  useEffect(() => { fetchAll() }, [])

  async function remove(id: string) {
    if (!confirm('Διαγραφή αγώνα; Θα σβηστούν και οι φάσεις του.')) return
    const { error } = await supabase.from('matches').delete().eq('match_id', id)
    if (error) return toast.error('Δεν διαγράφηκε')
    toast.success('Διαγράφηκε'); fetchAll()
  }

  if (load) return <Loading />

  const filtered = filter ? rows.filter(r => r.league_id === filter) : rows

  // Ομαδοποίηση: πρωτάθλημα → αγωνιστική (φθίνουσα) → αγώνες
  const leagueOrder = leagues.map(l => l.league_id)
  const byLeague = new Map<string, { id: string; name: string; rounds: Map<number, any[]> }>()
  for (const m of filtered) {
    if (!byLeague.has(m.league_id)) {
      byLeague.set(m.league_id, { id: m.league_id, name: m.league?.name ?? '—', rounds: new Map() })
    }
    const g = byLeague.get(m.league_id)!
    const r = m.round ?? 0
    if (!g.rounds.has(r)) g.rounds.set(r, [])
    g.rounds.get(r)!.push(m)
  }
  const groups = [...byLeague.values()]
    .sort((a, b) => leagueOrder.indexOf(a.id) - leagueOrder.indexOf(b.id))
    .map(g => ({
      ...g,
      roundList: [...g.rounds.entries()].sort((a, b) => b[0] - a[0]),
    }))

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-extrabold text-chalk">Αγώνες</h1>
        <button onClick={() => { setEdit(null); setOpen(true) }}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand
            text-white text-[12.5px] font-extrabold">+ Νέος</button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        <button onClick={() => setFilter('')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold
            ${!filter ? 'bg-brand text-chalk' : 'bg-turf text-dim'}`}>Όλα</button>
        {leagues.map(l => (
          <button key={l.league_id} onClick={() => setFilter(l.league_id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold
              whitespace-nowrap ${filter === l.league_id
                ? 'bg-brand text-chalk' : 'bg-turf text-dim'}`}>{l.name}</button>
        ))}
      </div>

      {!filtered.length ? <Empty>Δεν υπάρχουν αγώνες.</Empty> : (
        <div className="flex flex-col gap-4">
          {groups.map(g => (
            <div key={g.id}>
              {!filter && (
                <div className="flex items-center gap-2 mb-2 px-0.5">
                  <span className="text-[13px] font-extrabold text-lit">{g.name}</span>
                  <span className="text-[10px] text-dim font-bold">
                    {g.roundList.reduce((n, [, ms]) => n + ms.length, 0)} αγώνες
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {g.roundList.map(([round, ms]) => {
                  const key = `${g.id}:${round}`
                  const openR = !collapsed.has(key)
                  return (
                    <div key={key} className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                      <button onClick={() => toggleRound(key)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 active:bg-chalk/[0.03]">
                        <span className="text-[12px] font-extrabold text-silver">
                          Αγωνιστική {round}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-dim font-bold tnum">{ms.length}</span>
                          <span className="text-dim text-[10px]">{openR ? '▾' : '▸'}</span>
                        </span>
                      </button>
                      {openR && (
                        <div className="flex flex-col">
                          {ms.map(m => {
                            const played = ['Played', 'Forfeit'].includes(m.match_status)
                            const live = m.match_status === 'Live'
                            return (
                              <div key={m.match_id}
                                className="flex items-center gap-1.5 px-2.5 py-2 border-t border-chalk/[0.05]">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ background: STATUS_DOT[m.match_status] ?? '#8a8a93' }} />
                                <button onClick={() => { setEdit(m); setOpen(true) }}
                                  className="flex-1 flex items-center gap-1.5 min-w-0 text-left active:opacity-70">
                                  <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={18} />
                                  <span className="flex-1 text-[12px] font-semibold text-chalk truncate text-right">
                                    {m.team_a_data?.name}
                                  </span>
                                  <span className="shrink-0 px-1 text-[12px] font-extrabold text-silver tnum">
                                    {live || played ? `${m.goals_team_a}·${m.goals_team_b}` : 'vs'}
                                  </span>
                                  <span className="flex-1 text-[12px] font-semibold text-chalk truncate">
                                    {m.team_b_data?.name}
                                  </span>
                                  <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={18} />
                                </button>
                                <a href={`/speaker/${m.match_id}`} title="Panel"
                                  className="w-7 h-7 shrink-0 grid place-items-center rounded-lg
                                    bg-chalk/[0.05] text-silver text-[13px] active:bg-chalk/10">🎙</a>
                                <button onClick={() => remove(m.match_id)} title="Διαγραφή"
                                  className="w-7 h-7 shrink-0 grid place-items-center rounded-lg
                                    bg-danger/15 text-danger text-[11px] active:bg-danger/25">✕</button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <MatchForm row={edit} leagues={leagues} teams={teams} venues={venues}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchAll() }} />
      )}
    </div>
  )
}

function MatchForm({ row, leagues, teams, venues, onClose, onSaved }: {
  row: any; leagues: League[]; teams: Team[]; venues: Venue[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [league, setLeague]   = useState(row?.league_id ?? '')
  const [round, setRound]     = useState(String(row?.round ?? 1))
  const [teamA, setTeamA]     = useState(row?.team_a ?? '')
  const [teamB, setTeamB]     = useState(row?.team_b ?? '')
  const [venue, setVenue]     = useState(row?.venue_id ?? '')
  const [field, setField]     = useState(row?.field ?? '')
  const [date, setDate]       = useState(toDatetimeLocal(row?.match_date))
  const [status, setStatus]   = useState<MatchState>(row?.match_status ?? 'Scheduled')
  const [stream, setStream]   = useState(row?.stream_url ?? '')
  const [busy, setBusy]       = useState(false)

  const leagueTeams = teams.filter(t => t.league_id === league)
  const venueFields = venues.find(v => v.venue_id === venue)?.fields ?? []

  async function save() {
    if (!league)          return toast.error('Διάλεξε πρωτάθλημα')
    if (!teamA || !teamB) return toast.error('Διάλεξε ομάδες')
    if (teamA === teamB)  return toast.error('Ίδια ομάδα δύο φορές')
    setBusy(true)

    const payload = {
      league_id: league,
      round: parseInt(round) || 1,
      team_a: teamA,
      team_b: teamB,
      venue_id: venue || null,
      field: field || null,
      match_date: date ? new Date(date).toISOString() : null,
      match_status: status,
      stream_url: stream.trim() || null,
    }
    const { error } = row
      ? await supabase.from('matches').update(payload).eq('match_id', row.match_id)
      : await supabase.from('matches').insert(payload)

    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε: ' + error.message)
    toast.success('Αποθηκεύτηκε'); onSaved()
  }

  return (
    <Modal title={row ? 'Επεξεργασία αγώνα' : 'Νέος αγώνας'} onClose={onClose}>
      <Select label="ΠΡΩΤΑΘΛΗΜΑ" value={league}
        onChange={v => { setLeague(v); setTeamA(''); setTeamB('') }}
        options={leagues.map(l => ({ value: l.league_id, label: l.name }))} />
      <Field label="ΑΓΩΝΙΣΤΙΚΗ" value={round} onChange={setRound} numeric />

      <Select label="ΓΗΠΕΔΟΥΧΟΣ" value={teamA} onChange={setTeamA}
        options={leagueTeams.map(t => ({ value: t.team_id, label: t.name }))} />
      <Select label="ΦΙΛΟΞΕΝΟΥΜΕΝΟΣ" value={teamB} onChange={setTeamB}
        options={leagueTeams.map(t => ({ value: t.team_id, label: t.name }))} />

      <Select label="ΓΗΠΕΔΟ" value={venue}
        onChange={v => { setVenue(v); setField('') }}
        options={venues.map(v => ({ value: v.venue_id, label: v.name }))} />
      {venueFields.length > 0 && (
        <Select label="ΓΗΠΕΔΟ (αριθμός)" value={field} onChange={setField}
          options={venueFields.map(f => ({ value: f, label: f }))} />
      )}

      <div>
        <label className="block text-[8.5px] font-extrabold text-dim
          tracking-[0.12em] mb-1.5 pl-0.5">ΗΜΕΡΟΜΗΝΙΑ & ΩΡΑ</label>
        <input type="datetime-local" value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
            outline-none border border-chalk/[0.07] focus:border-lit/50" />
      </div>

      <Select label="ΚΑΤΑΣΤΑΣΗ" value={status}
        onChange={v => setStatus(v as MatchState)}
        options={STATUSES} />

      <Field label="ΣΥΝΔΕΣΜΟΣ YOUTUBE (live)" value={stream} onChange={setStream}
        placeholder="https://youtu.be/… ή https://youtube.com/watch?v=…" />

      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

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
        <div className="flex flex-col gap-1.5">
          {filtered.map(m => (
            <div key={m.match_id}
              className="bg-turf rounded-xl px-3.5 py-3 border border-chalk/[0.05]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9.5px] text-dim font-bold">
                  {m.league?.name} · Αγ. {m.round}
                </span>
                <span className="text-[9.5px] font-bold text-lit">
                  {STATUSES.find(s => s.value === m.match_status)?.label}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2.5">
                <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={20} />
                <span className="flex-1 text-[13px] font-semibold text-chalk truncate">
                  {m.team_a_data?.name}
                </span>
                <span className="text-base font-extrabold text-chalk tnum">
                  {m.goals_team_a}·{m.goals_team_b}
                </span>
                <span className="flex-1 text-[13px] font-semibold text-chalk truncate text-right">
                  {m.team_b_data?.name}
                </span>
                <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={20} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEdit(m); setOpen(true) }}
                  className="flex-1 py-2 rounded-lg bg-chalk/[0.05] text-silver
                    text-[11px] font-bold">Επεξεργασία</button>
                <a href={`/speaker/${m.match_id}`}
                  className="flex-1 py-2 rounded-lg bg-chalk/[0.05] text-silver
                    text-[11px] font-bold text-center">Panel</a>
                <button onClick={() => remove(m.match_id)}
                  className="px-3 py-2 rounded-lg bg-danger/15 text-danger
                    text-[11px] font-bold">✕</button>
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

      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Crest, Loading, Empty, FieldBadge } from '@/app/ui'
import { Modal, Field, Select, SaveBtn } from '../ui'
import { toDatetimeLocal, fmtDay, fmtTime } from '@/lib/time'
import toast from 'react-hot-toast'
import type { Team, League, Venue, MatchState, Profile } from '@/lib/types'

const STATUSES: { value: MatchState; label: string }[] = [
  { value: 'Scheduled', label: 'Προγραμματισμένος' },
  { value: 'Live',      label: 'Σε εξέλιξη' },
  { value: 'Played',    label: 'Ολοκληρωμένος' },
  { value: 'Postponed', label: 'Αναβλήθηκε' },
  { value: 'Forfeit',   label: 'Στα χαρτιά (άνευ αγώνα)' },
]

const STATUS_DOT: Record<string, string> = {
  Scheduled: '#8a8a93', Live: '#e0563c', Played: '#2FA84F',
  Postponed: '#c9a227', Forfeit: '#8a6d1f',
}

const STAGE_LBL: Record<string, string> = { QF: 'Προημ.', SF: 'Ημιτελ.', Final: 'Τελικός' }
const STAGE_RANK: Record<string, number> = { QF: 0, SF: 1, Final: 2 }

/** Ζευγάρωμα αγώνων ανά αντίπαλο: Α΄ γύρος (πρώτη συνάντηση) | Β΄ γύρος (δεύτερη). */
function buildFixtureRows(teamId: string, matches: any[]) {
  const oppMap = new Map<string, { oppName: string; oppLogo: string | null; legs: any[] }>()
  for (const m of matches) {
    const oppId = m.team_a === teamId ? m.team_b : m.team_a
    const od = m.team_a === teamId ? m.team_b_data : m.team_a_data
    if (!oppMap.has(oppId)) oppMap.set(oppId, { oppName: od?.name ?? '—', oppLogo: od?.logo_url ?? null, legs: [] })
    oppMap.get(oppId)!.legs.push(m)
  }
  return [...oppMap.values()]
    .map(r => {
      const legs = r.legs.slice().sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
      return { ...r, leg1: legs[0] ?? null, leg2: legs[1] ?? null, legsN: legs.length, firstRound: legs[0]?.round ?? 999 }
    })
    .sort((a, b) => a.firstRound - b.firstRound)
}

/** Κελί αγώνα (ένας γύρος) — πάτημα ανοίγει επεξεργασία. */
function AdminLeg({ m, teamId, onEdit }: { m: any; teamId: string; onEdit: () => void }) {
  if (!m) {
    return (
      <div className="rounded-lg bg-chalk/[0.02] border border-dashed border-chalk/[0.06]
        px-2 py-2.5 grid place-items-center min-h-[54px]">
        <span className="text-[11px] text-off">—</span>
      </div>
    )
  }
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)
  const us = m.team_a === teamId
  const gf = us ? m.goals_team_a : m.goals_team_b
  const ga = us ? m.goals_team_b : m.goals_team_a
  const resColor = !done ? 'text-chalk'
    : gf > ga ? 'text-[#2FA84F]' : gf < ga ? 'text-[#D8483C]' : 'text-dim'

  return (
    <button onClick={onEdit}
      className={`block w-full rounded-lg bg-turf border px-2 py-2 text-center active:bg-[#1C1C22]
        min-h-[54px] flex flex-col justify-center relative
        ${live ? 'border-live/35' : 'border-chalk/[0.05]'}`}>
      <span className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full"
        style={{ background: STATUS_DOT[m.match_status] ?? '#8a8a93' }} />
      <div className="text-[7.5px] font-extrabold text-off tracking-[0.06em] mb-0.5">Αγ.{m.round}</div>
      {live || done ? (
        <div className={`text-[16px] font-extrabold tnum leading-none ${resColor}`}>
          {gf}<span className="text-dim mx-0.5">-</span>{ga}
        </div>
      ) : m.match_date ? (
        <div className="leading-tight">
          <div className="text-[10px] font-bold text-silver">{fmtDay(m.match_date)}</div>
          <div className="text-[9.5px] text-dim tnum">{fmtTime(m.match_date)}</div>
        </div>
      ) : (
        <div className="text-[11px] font-extrabold text-off">VS</div>
      )}
      {m.field && (
        <div className="flex justify-center mt-1.5">
          <FieldBadge field={m.field} size="xs" />
        </div>
      )}
    </button>
  )
}

export default function AdminMatches() {
  const supabase = createClient()
  const [rows, setRows]       = useState<any[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [teams, setTeams]     = useState<Team[]>([])
  const [venues, setVenues]   = useState<Venue[]>([])
  const [people, setPeople]   = useState<Profile[]>([])
  const [staff, setStaff]     = useState<{ id: string; name: string; kind: string }[]>([])
  const [filter, setFilter]   = useState('')
  const [load, setLoad]       = useState(true)
  const [open, setOpen]       = useState(false)
  const [edit, setEdit]       = useState<any>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleTeam = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  async function fetchAll() {
    const [m, l, t, v, p, st] = await Promise.all([
      supabase.from('matches').select(`
        *, team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url),
        league:league_id(name), venue:venue_id(name)
      `).order('round', { ascending: false }).order('match_date'),
      supabase.from('leagues').select('*').order('sort_order'),
      supabase.from('teams').select('*').order('name'),
      supabase.from('venues').select('*').order('name'),
      supabase.from('profiles').select('id, full_name, email, role, team_id').order('full_name'),
      supabase.from('staff').select('id, name, kind').order('name'),
    ])
    setRows(m.data ?? [])
    setLeagues(l.data ?? [])
    setTeams(t.data ?? [])
    setVenues(v.data ?? [])
    setPeople(p.data ?? [])
    setStaff(st.data ?? [])
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

  // Ομαδοποίηση: πρωτάθλημα → ομάδα → οι αγώνες της ομάδας
  const leagueOrder = leagues.map(l => l.league_id)
  const leagueName = (id: string) => leagues.find(l => l.league_id === id)?.name ?? '—'
  const leagueMap = new Map<string, Map<string, { name: string; logo: string | null; matches: any[] }>>()
  for (const m of filtered) {
    if (!leagueMap.has(m.league_id)) leagueMap.set(m.league_id, new Map())
    const tmap = leagueMap.get(m.league_id)!
    for (const side of ['a', 'b'] as const) {
      const tid = side === 'a' ? m.team_a : m.team_b
      const td = side === 'a' ? m.team_a_data : m.team_b_data
      if (!tid) continue
      if (!tmap.has(tid)) tmap.set(tid, { name: td?.name ?? '—', logo: td?.logo_url ?? null, matches: [] })
      tmap.get(tid)!.matches.push(m)
    }
  }
  const groups = leagueOrder
    .filter(id => leagueMap.has(id))
    .map(id => ({
      id, name: leagueName(id),
      teams: [...leagueMap.get(id)!.entries()]
        .map(([team_id, v]) => ({ team_id, ...v }))
        .sort((a, b) => a.name.localeCompare(b.name, 'el')),
      // Playoff αγώνες (QF/SF/Final) — κάτω-κάτω ανά πρωτάθλημα
      playoff: filtered.filter((m: any) => m.league_id === id && m.stage && STAGE_RANK[m.stage] != null)
        .sort((a: any, b: any) => (STAGE_RANK[a.stage] - STAGE_RANK[b.stage]) ||
          (a.match_date ?? '').localeCompare(b.match_date ?? '')),
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
                  <span className="text-[10px] text-dim font-bold">{g.teams.length} ομάδες</span>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {g.teams.map(team => {
                  const key = `${g.id}:${team.team_id}`
                  const openT = expanded.has(key)
                  const fixtures = buildFixtureRows(team.team_id, team.matches.filter((m: any) => !m.stage))
                  const hasDup = fixtures.some(r => r.legsN > 2)
                  return (
                    <div key={key} className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                      {/* Κεφαλίδα ομάδας — μαζεμένη */}
                      <button onClick={() => toggleTeam(key)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-3 active:bg-chalk/[0.03]">
                        <Crest url={team.logo} name={team.name} size={26} />
                        <span className="flex-1 text-left text-[13.5px] font-extrabold text-chalk truncate">
                          {team.name}
                        </span>
                        {hasDup && <span className="text-[9px] font-black text-[#e0563c] bg-[#e0563c]/15 px-1.5 py-0.5 rounded-full">⚠ ΔΙΠΛΟ</span>}
                        <span className="text-[10px] text-dim font-bold tnum">{team.matches.length}</span>
                        <span className="text-dim text-[11px]">{openT ? '▾' : '▸'}</span>
                      </button>

                      {/* Αγωνιστικές — Α΄ / Β΄ γύρος */}
                      {openT && (
                        <div className="px-2.5 pb-3 pt-1 border-t border-chalk/[0.05]">
                          <div className="grid items-center gap-2 px-1 pb-1.5
                            [grid-template-columns:1fr_84px_1fr]">
                            <span className="text-[8px] font-extrabold text-dim tracking-[0.1em] text-center">Α΄ ΓΥΡΟΣ</span>
                            <span />
                            <span className="text-[8px] font-extrabold text-dim tracking-[0.1em] text-center">Β΄ ΓΥΡΟΣ</span>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {fixtures.map((r, i) => (
                              <div key={i} className="grid items-center gap-2
                                [grid-template-columns:1fr_84px_1fr]">
                                <AdminLeg m={r.leg1} teamId={team.team_id}
                                  onEdit={() => { setEdit(r.leg1); setOpen(true) }} />
                                <div className="flex flex-col items-center gap-1 min-w-0">
                                  <Crest url={r.oppLogo} name={r.oppName} size={24} />
                                  <span className="text-[9.5px] font-semibold text-silver text-center
                                    leading-tight truncate max-w-[84px]">{r.oppName}</span>
                                </div>
                                <AdminLeg m={r.leg2} teamId={team.team_id}
                                  onEdit={() => { setEdit(r.leg2); setOpen(true) }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* PLAYOFF — κάτω-κάτω, clickable προς το bracket */}
              {g.playoff.length > 0 && (
                <div className="mt-2 bg-turf rounded-xl border overflow-hidden"
                  style={{ borderColor: 'rgba(232,185,35,0.35)' }}>
                  <Link href={`/standings?league=${g.id}&view=playoff`}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 active:bg-chalk/[0.03]">
                    <span className="text-[14px]">🏆</span>
                    <span className="flex-1 text-left text-[12.5px] font-extrabold tracking-wide"
                      style={{ color: '#E8B923' }}>PLAYOFF</span>
                    <span className="text-[10px] text-dim font-bold">Δες bracket ›</span>
                  </Link>
                  <div className="px-2.5 pb-3 pt-1 border-t flex flex-col gap-1.5"
                    style={{ borderColor: 'rgba(232,185,35,0.18)' }}>
                    {g.playoff.map((m: any) => {
                      const done = ['Played', 'Forfeit'].includes(m.match_status)
                      return (
                        <button key={m.match_id} onClick={() => { setEdit(m); setOpen(true) }}
                          className="flex items-center gap-2 rounded-lg bg-chalk/[0.03] border border-chalk/[0.05]
                            px-2.5 py-2 text-left active:bg-[#1C1C22]">
                          <span className="text-[8.5px] font-black text-lit uppercase w-[62px] shrink-0">{STAGE_LBL[m.stage]}</span>
                          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={20} />
                          <span className="flex-1 text-[11.5px] font-bold text-chalk truncate">
                            {m.team_a_data?.name} – {m.team_b_data?.name}</span>
                          <span className="text-[12px] font-black tnum shrink-0 text-silver">
                            {done ? `${m.goals_team_a}-${m.goals_team_b}`
                              : (m.match_date ? fmtDay(m.match_date) : '—')}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <MatchForm row={edit} leagues={leagues} teams={teams} venues={venues} people={people} staff={staff}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchAll() }}
          onDelete={edit ? () => { setOpen(false); remove(edit.match_id) } : undefined} />
      )}
    </div>
  )
}

function MatchForm({ row, leagues, teams, venues, people, staff, onClose, onSaved, onDelete }: {
  row: any; leagues: League[]; teams: Team[]; venues: Venue[]; people: Profile[]
  staff: { id: string; name: string; kind: string }[]
  onClose: () => void; onSaved: () => void; onDelete?: () => void
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
  // Νίκη στα χαρτιά: ποια ομάδα κερδίζει 3-0 (ή καμία = 0-0, διπλή απουσία)
  const [ffWinner, setFfWinner] = useState<'a' | 'b' | 'none'>(
    row?.match_status === 'Forfeit'
      ? ((row.goals_team_a ?? 0) > (row.goals_team_b ?? 0) ? 'a'
        : (row.goals_team_b ?? 0) > (row.goals_team_a ?? 0) ? 'b' : 'none')
      : 'a')
  const FORFEIT_GOALS = 3
  // Χειροκίνητο σκορ για ολοκληρωμένο αγώνα (χωρίς καταχώρηση event-event)
  const [scoreA, setScoreA] = useState(String(row?.goals_team_a ?? 0))
  const [scoreB, setScoreB] = useState(String(row?.goals_team_b ?? 0))
  // Φάση: regular = κανονική περίοδος (βαθμολογία) · QF/SF/Final = playoff (bracket)
  const [stage, setStage] = useState<string>(row?.stage ?? 'regular')
  // Συντελεστές αγώνα — επιλογή χρήστη (profiles) ανά ρόλο
  const [speakerId, setSpeakerId]           = useState(row?.speaker_id ?? '')
  const [refereeId, setRefereeId]           = useState(row?.referee_id ?? '')
  const [photographerId, setPhotographerId] = useState(row?.photographer_id ?? '')

  const leagueTeams = teams.filter(t => t.league_id === league)
  const venueFields = venues.find(v => v.venue_id === venue)?.fields ?? []

  // Σπίκερ → χρήστες (συνδέονται)· Διαιτητής/Φωτογράφος → προσωπικό (staff, μόνο όνομα)
  const pName = (p: Profile) => p.full_name || p.email || '—'
  const speakerOpts      = people.filter(p => ['admin', 'speaker'].includes(p.role))
    .map(p => ({ value: p.id, label: pName(p) }))
  const refereeOpts      = staff.filter(s => s.kind === 'referee')
    .map(s => ({ value: s.id, label: s.name }))
  const photographerOpts = staff.filter(s => s.kind === 'photographer')
    .map(s => ({ value: s.id, label: s.name }))

  async function save() {
    if (!league)          return toast.error('Διάλεξε πρωτάθλημα')
    if (!teamA || !teamB) return toast.error('Διάλεξε ομάδες')
    if (teamA === teamB)  return toast.error('Ίδια ομάδα δύο φορές')
    setBusy(true)

    const payload: any = {
      league_id: league,
      round: parseInt(round) || 1,
      team_a: teamA,
      team_b: teamB,
      venue_id: venue || null,
      field: field || null,
      match_date: date ? new Date(date).toISOString() : null,
      match_status: status,
      stream_url: stream.trim() || null,
      stage: stage === 'regular' ? null : stage,
      speaker_id: speakerId || null,
      referee_id: refereeId || null,
      photographer_id: photographerId || null,
    }
    // Νίκη στα χαρτιά → γράφουμε απευθείας το σκορ 3-0 (το trigger recalc_score
    // τρέχει μόνο σε αλλαγές events, οπότε το άμεσο update διατηρείται).
    if (status === 'Forfeit') {
      payload.goals_team_a = ffWinner === 'a' ? FORFEIT_GOALS : 0
      payload.goals_team_b = ffWinner === 'b' ? FORFEIT_GOALS : 0
      payload.pens_team_a = 0
      payload.pens_team_b = 0
    }
    // Ολοκληρωμένος με χειροκίνητο σκορ (μετράει στη βαθμολογία). Προσοχή: αν ο αγώνας
    // έχει καταχωρημένα events, το trigger θα ξαναϋπολογίσει το σκορ σε επόμενη αλλαγή event.
    if (status === 'Played') {
      payload.goals_team_a = parseInt(scoreA) || 0
      payload.goals_team_b = parseInt(scoreB) || 0
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

      <Select label="ΦΑΣΗ" value={stage} onChange={setStage}
        options={[
          { value: 'regular', label: 'Κανονική περίοδος (βαθμολογία)' },
          { value: 'QF',      label: 'Playoff · Προημιτελικά (1-8, 2-7, 3-6, 4-5)' },
          { value: 'SF',      label: 'Playoff · Ημιτελικά' },
          { value: 'Final',   label: 'Playoff · Τελικός' },
        ]} />

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

      {status === 'Forfeit' && (
        <Select label="ΝΙΚΗΤΡΙΑ ΣΤΑ ΧΑΡΤΙΑ (3-0)" value={ffWinner}
          onChange={v => setFfWinner(v as 'a' | 'b' | 'none')}
          options={[
            { value: 'a', label: `${leagueTeams.find(t => t.team_id === teamA)?.name ?? 'Γηπεδούχος'} (3-0)` },
            { value: 'b', label: `${leagueTeams.find(t => t.team_id === teamB)?.name ?? 'Φιλοξενούμενος'} (0-3)` },
            { value: 'none', label: 'Διπλή απουσία (0-0)' },
          ]} />
      )}

      {status === 'Played' && (
        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΤΕΛΙΚΟ ΣΚΟΡ</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <input value={scoreA} onChange={e => setScoreA(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="0"
                className="w-full bg-chalk/[0.04] rounded-xl px-3 py-3 text-chalk text-center text-lg
                  font-extrabold tnum outline-none border border-chalk/[0.07] focus:border-lit/50" />
              <p className="text-[9px] text-dim text-center mt-1 truncate">
                {leagueTeams.find(t => t.team_id === teamA)?.name ?? 'Γηπεδούχος'}</p>
            </div>
            <span className="text-dim font-bold shrink-0">–</span>
            <div className="flex-1 min-w-0">
              <input value={scoreB} onChange={e => setScoreB(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="0"
                className="w-full bg-chalk/[0.04] rounded-xl px-3 py-3 text-chalk text-center text-lg
                  font-extrabold tnum outline-none border border-chalk/[0.07] focus:border-lit/50" />
              <p className="text-[9px] text-dim text-center mt-1 truncate">
                {leagueTeams.find(t => t.team_id === teamB)?.name ?? 'Φιλοξενούμενος'}</p>
            </div>
          </div>
          <p className="text-[9px] text-off mt-1.5 pl-0.5">
            Γράφεται απευθείας & μετράει στη βαθμολογία. (Αν ο αγώνας έχει καταχωρημένες φάσεις,
            το σκορ βγαίνει από αυτές.)
          </p>
        </div>
      )}

      <Field label="ΣΥΝΔΕΣΜΟΣ YOUTUBE (live)" value={stream} onChange={setStream}
        placeholder="https://youtu.be/… ή https://youtube.com/watch?v=…" />

      <Select label="🎙 ΣΠΙΚΕΡ" value={speakerId} onChange={setSpeakerId} options={speakerOpts} />
      <Select label="🟨 ΔΙΑΙΤΗΤΗΣ" value={refereeId} onChange={setRefereeId} options={refereeOpts} />
      <Select label="📷 ΦΩΤΟΓΡΑΦΟΣ" value={photographerId} onChange={setPhotographerId} options={photographerOpts} />

      <SaveBtn busy={busy} onClick={save} />

      {row && (
        <div className="flex gap-2 mt-2">
          <a href={`/speaker/${row.match_id}`}
            className="flex-1 py-2.5 rounded-xl bg-chalk/[0.05] border border-chalk/[0.08]
              text-silver text-[12.5px] font-bold text-center">🎙 Panel</a>
          <button onClick={onDelete}
            className="flex-1 py-2.5 rounded-xl bg-danger/15 border border-danger/30
              text-danger text-[12.5px] font-bold">Διαγραφή</button>
        </div>
      )}
    </Modal>
  )
}

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

const RESP_DOT: Record<string, string> = { ok: '#2FA84F', reschedule: '#c9a227', postpone: '#D8483C' }
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
function AdminLeg({ m, teamId, onEdit, resp }: { m: any; teamId: string; onEdit: () => void; resp?: { a?: string; b?: string } }) {
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
        <>
          <div className={`text-[16px] font-extrabold tnum leading-none ${resColor}`}>
            {gf}<span className="text-dim mx-0.5">-</span>{ga}
          </div>
          {m.match_date && (
            <div className="text-[8.5px] text-off tnum mt-0.5">{fmtDay(m.match_date)}</div>
          )}
        </>
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
      {resp && (resp.a || resp.b) && (
        <div className="flex justify-center gap-1 mt-1" title="Απαντήσεις captain (γηπεδούχος · φιλοξ.)">
          {(['a', 'b'] as const).map(s => (
            <span key={s} className="w-1.5 h-1.5 rounded-full"
              style={{ background: RESP_DOT[resp[s] ?? ''] ?? 'rgba(255,255,255,0.14)' }} />
          ))}
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
  const [preset, setPreset]   = useState<any>(null)
  const [standings, setStandings] = useState<any[]>([])
  const [resp, setResp] = useState<Record<string, { a?: string; b?: string }>>({})
  const [respRows, setRespRows] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleTeam = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  async function fetchAll() {
    const [m, l, t, v, p, st, sd, mr] = await Promise.all([
      supabase.from('matches').select(`
        *, team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url),
        league:league_id(name), venue:venue_id(name)
      `).order('round', { ascending: false }).order('match_date'),
      supabase.from('leagues').select('*').order('sort_order'),
      supabase.from('teams').select('*').order('name'),
      supabase.from('venues').select('*').order('name'),
      supabase.from('profiles').select('id, full_name, email, role, team_id').order('full_name'),
      supabase.from('staff').select('id, name, kind').order('name'),
      supabase.from('standings').select('league_id, team_id, team_name, logo_url, position').order('position'),
      supabase.from('match_responses').select('match_id, team_id, status, note, updated_at'),
    ])
    setRows(m.data ?? [])
    setLeagues(l.data ?? [])
    setTeams(t.data ?? [])
    setVenues(v.data ?? [])
    setPeople(p.data ?? [])
    setStaff(st.data ?? [])
    setStandings(sd.data ?? [])
    // Απαντήσεις captain ανά αγώνα → πλευρά (a/b) βάσει team_id
    const mByeId = new Map((m.data ?? []).map((x: any) => [x.match_id, x]))
    const rmap: Record<string, { a?: string; b?: string }> = {}
    for (const r of mr.data ?? []) {
      const mm: any = mByeId.get(r.match_id)
      if (!mm) continue
      const side = r.team_id === mm.team_a ? 'a' : r.team_id === mm.team_b ? 'b' : null
      if (!side) continue
      ;(rmap[r.match_id] ??= {})[side] = r.status
    }
    setResp(rmap)
    setRespRows(mr.data ?? [])
    setLoad(false)
  }

  useEffect(() => { fetchAll() }, [])

  async function remove(id: string) {
    if (!confirm('Διαγραφή αγώνα; Θα σβηστούν και οι φάσεις του.')) return
    const { error } = await supabase.from('matches').delete().eq('match_id', id)
    if (error) return toast.error('Δεν διαγράφηκε')
    toast.success('Διαγράφηκε'); fetchAll()
  }

  // Τακτοποίηση αιτήματος captain: σβήνει την απάντηση → φεύγει από το πάνελ & πέφτει το σήμα.
  async function dismissRequest(matchId: string, teamId: string) {
    setRespRows(prev => prev.filter(r => !(r.match_id === matchId && r.team_id === teamId)))
    const { error } = await supabase.from('match_responses').delete()
      .eq('match_id', matchId).eq('team_id', teamId)
    if (error) { toast.error('Δεν αφαιρέθηκε'); fetchAll(); return }
    toast.success('Τακτοποιήθηκε')
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

  // Ζευγάρια προημιτελικών από τη βαθμολογία (1-8, 4-5, 2-7, 3-6) για γρήγορη δημιουργία
  const QF_PAIRS: [number, number][] = [[1, 8], [4, 5], [2, 7], [3, 6]]
  const qfPairings = (leagueId: string) => {
    const seeds = standings.filter(s => s.league_id === leagueId).sort((a, b) => a.position - b.position)
    if (seeds.length < 8) return [] as { home: any; away: any; label: string }[]
    const byPos = (p: number) => seeds.find(s => s.position === p)
    return QF_PAIRS
      .map(([h, a]) => ({ home: byPos(h), away: byPos(a), label: `${h}ος–${a}ος` }))
      .filter(x => x.home && x.away)
  }
  // Νικητής ζευγαριού (συνολική διαφορά) — null αν δεν έχουν παιχτεί όλα τα σκέλη ή ισοπαλία
  const tieWinnerId = (leagueId: string, aId: string, bId: string, stage: string): string | null => {
    const legN = stage === 'Final' ? 1 : 2
    const ms = rows.filter((m: any) => m.league_id === leagueId && m.stage === stage &&
      ['Played', 'Forfeit'].includes(m.match_status) &&
      ((m.team_a === aId && m.team_b === bId) || (m.team_a === bId && m.team_b === aId)))
    if (ms.length < legN) return null
    let ga = 0, gb = 0
    for (const m of ms) {
      ga += m.team_a === aId ? (m.goals_team_a ?? 0) : (m.goals_team_b ?? 0)
      gb += m.team_a === aId ? (m.goals_team_b ?? 0) : (m.goals_team_a ?? 0)
    }
    return ga === gb ? null : (ga > gb ? aId : bId)
  }
  // Ζευγάρια ημιτελικών από τους νικητές των QF (κενό = δεν έχει κριθεί ακόμη)
  const sfPairings = (leagueId: string) => {
    const seeds = standings.filter(s => s.league_id === leagueId).sort((a, b) => a.position - b.position)
    if (seeds.length < 8) return [] as any[]
    const byPos = (p: number) => seeds.find(s => s.position === p)
    const info = (id: string | null) => id ? seeds.find(s => s.team_id === id) : null
    const win = (h: number, a: number) => {
      const H = byPos(h), A = byPos(a)
      return (H && A) ? tieWinnerId(leagueId, H.team_id, A.team_id, 'QF') : null
    }
    return [
      { label: 'Ημιτελικός 1', home: info(win(1, 8)), away: info(win(4, 5)), homeLbl: 'Νικ. 1ος-8ος', awayLbl: 'Νικ. 4ος-5ος' },
      { label: 'Ημιτελικός 2', home: info(win(2, 7)), away: info(win(3, 6)), homeLbl: 'Νικ. 2ος-7ος', awayLbl: 'Νικ. 3ος-6ος' },
    ]
  }
  // Ζευγάρι τελικού από τους νικητές των ημιτελικών (κενό = δεν κρίθηκε ακόμη).
  // Γηπεδούχος τυπικά ο φιναλίστ με ψηλότερη θέση στην κανονική περίοδο.
  const finalPairing = (leagueId: string) => {
    const seeds = standings.filter(s => s.league_id === leagueId).sort((a, b) => a.position - b.position)
    if (seeds.length < 8) return null as any
    const byPos = (p: number) => seeds.find(s => s.position === p)
    const info = (id: string | null) => id ? seeds.find(s => s.team_id === id) : null
    const w = (h: number, a: number) => {
      const H = byPos(h), A = byPos(a)
      return (H && A) ? tieWinnerId(leagueId, H.team_id, A.team_id, 'QF') : null
    }
    const sfWin = (x: string | null, y: string | null) => (x && y) ? tieWinnerId(leagueId, x, y, 'SF') : null
    let A = { team: info(sfWin(w(1, 8), w(4, 5))), lbl: 'Νικ. Ημιτελικού 1' }
    let B = { team: info(sfWin(w(2, 7), w(3, 6))), lbl: 'Νικ. Ημιτελικού 2' }
    if (A.team && B.team && B.team.position < A.team.position) { const t = A; A = B; B = t }
    return { home: A.team, away: B.team, homeLbl: A.lbl, awayLbl: B.lbl }
  }
  const openNew = (p: any = null) => { setEdit(null); setPreset(p); setOpen(true) }
  const openEdit = (m: any) => { setEdit(m); setPreset(null); setOpen(true) }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-extrabold text-chalk">Αγώνες</h1>
        <button onClick={() => openNew()}
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

      {/* Αιτήματα captains (αλλαγή ώρας / αναβολή) — πάτα για επεξεργασία του αγώνα */}
      {(() => {
        const pend = respRows.filter(r => r.status !== 'ok')
        if (!pend.length) return null
        const mById = new Map(rows.map((m: any) => [m.match_id, m]))
        const tName = new Map(teams.map((t: any) => [t.team_id, t.name]))
        const items = pend.map((r: any) => ({ ...r, m: mById.get(r.match_id), team: tName.get(r.team_id) ?? '—' }))
          .filter((x: any) => x.m)
          .sort((a: any, b: any) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
        if (!items.length) return null
        return (
          <div className="mb-4 rounded-xl border overflow-hidden"
            style={{ borderColor: 'rgba(201,162,39,0.35)', background: 'rgba(201,162,39,0.06)' }}>
            <div className="px-3.5 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(201,162,39,0.2)' }}>
              <span>📣</span>
              <span className="flex-1 text-[12px] font-extrabold" style={{ color: '#e8b923' }}>Αιτήματα captains</span>
              <span className="text-[10px] text-dim font-bold">{items.length}</span>
            </div>
            <div className="flex flex-col">
              {items.map((x: any, i: number) => (
                <div key={`${x.match_id}|${x.team_id}`}
                  className={`flex items-stretch ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                  <button onClick={() => openEdit(x.m)} className="flex-1 text-left px-3.5 py-2.5 active:bg-chalk/[0.03] min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                        style={{
                          background: x.status === 'postpone' ? 'rgba(216,72,60,0.15)' : 'rgba(201,162,39,0.18)',
                          color: x.status === 'postpone' ? '#D8483C' : '#e8b923',
                        }}>
                        {x.status === 'postpone' ? 'ΑΝΑΒΟΛΗ' : 'ΑΛΛΑΓΗ ΩΡΑΣ'}
                      </span>
                      <span className="text-[12px] font-bold text-chalk truncate shrink-0 max-w-[40%]">{x.team}</span>
                      <span className="text-[10.5px] text-dim truncate">
                        {x.m.team_a_data?.name ?? x.m.placeholder_a ?? '—'} – {x.m.team_b_data?.name ?? x.m.placeholder_b ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {x.m.match_date && <span className="text-[9.5px] text-off tnum shrink-0">{fmtDay(x.m.match_date)} · {fmtTime(x.m.match_date)}</span>}
                    </div>
                    {x.note && (
                      <p className="text-[11px] text-silver mt-1 whitespace-pre-wrap break-words leading-snug">
                        «{x.note}»
                      </p>
                    )}
                  </button>
                  <button onClick={() => dismissRequest(x.match_id, x.team_id)}
                    title="Τακτοποιήθηκε — αφαίρεση"
                    className="px-3.5 shrink-0 grid place-items-center text-[#2FA84F] active:bg-chalk/[0.03] border-l border-chalk/[0.05] text-base font-black">
                    ✓
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

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
                                <AdminLeg m={r.leg1} teamId={team.team_id} resp={r.leg1 ? resp[r.leg1.match_id] : undefined}
                                  onEdit={() => openEdit(r.leg1)} />
                                <div className="flex flex-col items-center gap-1 min-w-0">
                                  <Crest url={r.oppLogo} name={r.oppName} size={24} />
                                  <span className="text-[9.5px] font-semibold text-silver text-center
                                    leading-tight truncate max-w-[84px]">{r.oppName}</span>
                                </div>
                                <AdminLeg m={r.leg2} teamId={team.team_id} resp={r.leg2 ? resp[r.leg2.match_id] : undefined}
                                  onEdit={() => openEdit(r.leg2)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* PLAYOFF — κάτω-κάτω, πάντα clickable προς το bracket */}
              <div className="mt-2 bg-turf rounded-xl border overflow-hidden"
                style={{ borderColor: 'rgba(232,185,35,0.35)' }}>
                <Link href={`/standings?league=${g.id}&view=playoff`}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 active:bg-chalk/[0.03]">
                  <span className="text-[14px]">🏆</span>
                  <span className="flex-1 text-left text-[12.5px] font-extrabold tracking-wide"
                    style={{ color: '#E8B923' }}>PLAYOFF</span>
                  <span className="text-[10px] text-dim font-bold">
                    {g.playoff.length > 0 ? 'Δες bracket ›' : 'Δες bracket (θέσεις) ›'}</span>
                </Link>
                {g.playoff.length > 0 && (
                  <div className="px-2.5 pb-2.5 pt-1 border-t flex flex-col gap-1.5"
                    style={{ borderColor: 'rgba(232,185,35,0.18)' }}>
                    {g.playoff.map((m: any) => {
                      const done = ['Played', 'Forfeit'].includes(m.match_status)
                      return (
                        <button key={m.match_id} onClick={() => openEdit(m)}
                          className="flex items-center gap-2 rounded-lg bg-chalk/[0.03] border border-chalk/[0.05]
                            px-2.5 py-2 text-left active:bg-[#1C1C22]">
                          <span className="text-[8.5px] font-black text-lit uppercase w-[62px] shrink-0">{STAGE_LBL[m.stage]}</span>
                          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name ?? m.placeholder_a ?? '?'} size={20} />
                          <span className="flex-1 text-[11.5px] font-bold text-chalk truncate">
                            {m.team_a_data?.name ?? m.placeholder_a ?? '—'} – {m.team_b_data?.name ?? m.placeholder_b ?? '—'}</span>
                          <span className="text-[12px] font-black tnum shrink-0 text-silver">
                            {done ? `${m.goals_team_a}-${m.goals_team_b}`
                              : (m.match_date ? fmtDay(m.match_date) : '—')}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Γρήγορη δημιουργία προημιτελικών (2 αγώνες ανά ζευγάρι, εναλλάξ έδρα) */}
                {qfPairings(g.id).length > 0 && (
                  <div className="px-2.5 pb-3 pt-2 border-t flex flex-col gap-2"
                    style={{ borderColor: 'rgba(232,185,35,0.18)' }}>
                    <span className="text-[8.5px] font-extrabold text-dim tracking-[0.1em] pl-0.5">
                      ΓΡΗΓΟΡΗ ΔΗΜΙΟΥΡΓΙΑ · ΠΡΟΗΜΙΤΕΛΙΚΑ (διπλά, εναλλάξ έδρα)
                    </span>
                    {qfPairings(g.id).map((pr, i) => (
                      <div key={i} className="rounded-lg bg-chalk/[0.03] border border-chalk/[0.05] px-2.5 py-2 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[8.5px] font-black text-dim w-[42px] shrink-0">{pr.label}</span>
                          <Crest url={pr.home.logo_url} name={pr.home.team_name} size={18} />
                          <span className="flex-1 text-[11.5px] font-bold text-chalk truncate">
                            {pr.home.team_name} – {pr.away.team_name}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openNew({ league_id: g.id, team_a: pr.home.team_id, team_b: pr.away.team_id, stage: 'QF' })}
                            className="flex-1 rounded-md bg-chalk/[0.04] border border-chalk/[0.06] px-2 py-1.5 text-left active:bg-[#1C1C22]">
                            <span className="text-[8.5px] text-off font-bold">Α΄ ΑΓΩΝΑΣ · ΕΔΡΑ</span>
                            <span className="block text-[10.5px] font-extrabold text-chalk truncate">🏟 {pr.home.team_name}</span>
                          </button>
                          <button
                            onClick={() => openNew({ league_id: g.id, team_a: pr.away.team_id, team_b: pr.home.team_id, stage: 'QF' })}
                            className="flex-1 rounded-md bg-chalk/[0.04] border border-chalk/[0.06] px-2 py-1.5 text-left active:bg-[#1C1C22]">
                            <span className="text-[8.5px] text-off font-bold">Β΄ ΑΓΩΝΑΣ · ΕΔΡΑ</span>
                            <span className="block text-[10.5px] font-extrabold text-chalk truncate">🏟 {pr.away.team_name}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Γρήγορη δημιουργία ημιτελικών (νικητές QF· «διάλεξε» αν δεν κρίθηκαν) */}
                {qfPairings(g.id).length > 0 && (
                  <div className="px-2.5 pb-3 pt-2 border-t flex flex-col gap-2"
                    style={{ borderColor: 'rgba(232,185,35,0.18)' }}>
                    <span className="text-[8.5px] font-extrabold text-dim tracking-[0.1em] pl-0.5">
                      ΓΡΗΓΟΡΗ ΔΗΜΙΟΥΡΓΙΑ · ΗΜΙΤΕΛΙΚΑ (διπλά, εναλλάξ έδρα)
                    </span>
                    {sfPairings(g.id).map((pr: any, i: number) => {
                      const hName = pr.home?.team_name ?? pr.homeLbl
                      const aName = pr.away?.team_name ?? pr.awayLbl
                      return (
                        <div key={i} className="rounded-lg bg-chalk/[0.03] border border-chalk/[0.05] px-2.5 py-2 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[8.5px] font-black text-dim w-[62px] shrink-0">{pr.label}</span>
                            <span className="flex-1 text-[11.5px] font-bold text-chalk truncate">
                              {hName} – {aName}</span>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => openNew({ league_id: g.id, stage: 'SF',
                                team_a: pr.home?.team_id, team_b: pr.away?.team_id,
                                placeholder_a: pr.home ? null : pr.homeLbl, placeholder_b: pr.away ? null : pr.awayLbl })}
                              className="flex-1 rounded-md bg-chalk/[0.04] border border-chalk/[0.06] px-2 py-1.5 text-left active:bg-[#1C1C22]">
                              <span className="text-[8.5px] text-off font-bold">Α΄ ΑΓΩΝΑΣ · ΕΔΡΑ</span>
                              <span className="block text-[10.5px] font-extrabold text-chalk truncate">🏟 {hName}</span>
                            </button>
                            <button
                              onClick={() => openNew({ league_id: g.id, stage: 'SF',
                                team_a: pr.away?.team_id, team_b: pr.home?.team_id,
                                placeholder_a: pr.away ? null : pr.awayLbl, placeholder_b: pr.home ? null : pr.homeLbl })}
                              className="flex-1 rounded-md bg-chalk/[0.04] border border-chalk/[0.06] px-2 py-1.5 text-left active:bg-[#1C1C22]">
                              <span className="text-[8.5px] text-off font-bold">Β΄ ΑΓΩΝΑΣ · ΕΔΡΑ</span>
                              <span className="block text-[10.5px] font-extrabold text-chalk truncate">🏟 {aName}</span>
                            </button>
                          </div>
                          {(!pr.home || !pr.away) && (
                            <span className="text-[8.5px] text-off pl-0.5">
                              Ο άγνωστος αντίπαλος μπαίνει ως «εκκρεμεί» — όρισε ημερομηνία τώρα, συμπλήρωσε ομάδα μετά.
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Γρήγορη δημιουργία τελικού (νικητές ημιτελικών· «εκκρεμεί» αν δεν κρίθηκαν) */}
                {qfPairings(g.id).length > 0 && (() => {
                  const fp = finalPairing(g.id)
                  if (!fp) return null
                  const hName = fp.home?.team_name ?? fp.homeLbl
                  const aName = fp.away?.team_name ?? fp.awayLbl
                  return (
                    <div className="px-2.5 pb-3 pt-2 border-t flex flex-col gap-2"
                      style={{ borderColor: 'rgba(232,185,35,0.18)' }}>
                      <span className="text-[8.5px] font-extrabold text-dim tracking-[0.1em] pl-0.5">
                        ΓΡΗΓΟΡΗ ΔΗΜΙΟΥΡΓΙΑ · ΤΕΛΙΚΟΣ (μονός αγώνας)
                      </span>
                      <div className="rounded-lg bg-chalk/[0.03] border border-chalk/[0.05] px-2.5 py-2 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[8.5px] font-black text-dim w-[54px] shrink-0">🏆 Τελικός</span>
                          <span className="flex-1 text-[11.5px] font-bold text-chalk truncate">{hName} – {aName}</span>
                        </div>
                        <button
                          onClick={() => openNew({ league_id: g.id, stage: 'Final',
                            team_a: fp.home?.team_id, team_b: fp.away?.team_id,
                            placeholder_a: fp.home ? null : fp.homeLbl, placeholder_b: fp.away ? null : fp.awayLbl })}
                          className="rounded-md bg-chalk/[0.04] border border-chalk/[0.06] px-2 py-1.5 text-left active:bg-[#1C1C22]">
                          <span className="text-[8.5px] text-off font-bold">ΓΗΠΕΔΟΥΧΟΣ (ψηλότερος στην κανονική)</span>
                          <span className="block text-[10.5px] font-extrabold text-chalk truncate">🏟 {hName}</span>
                        </button>
                        {(!fp.home || !fp.away) && (
                          <span className="text-[8.5px] text-off pl-0.5">
                            Ο άγνωστος φιναλίστ μπαίνει ως «εκκρεμεί» — όρισε ημερομηνία τώρα, συμπλήρωσε ομάδα μετά.
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <MatchForm row={edit} preset={preset} leagues={leagues} teams={teams} venues={venues} people={people} staff={staff}
          onClose={() => { setOpen(false); setPreset(null) }}
          onSaved={() => { setOpen(false); setPreset(null); fetchAll() }}
          onDelete={edit ? () => { setOpen(false); setPreset(null); remove(edit.match_id) } : undefined} />
      )}
    </div>
  )
}

function MatchForm({ row, preset, leagues, teams, venues, people, staff, onClose, onSaved, onDelete }: {
  row: any; preset?: any; leagues: League[]; teams: Team[]; venues: Venue[]; people: Profile[]
  staff: { id: string; name: string; kind: string }[]
  onClose: () => void; onSaved: () => void; onDelete?: () => void
}) {
  const supabase = createClient()
  // src = υπάρχων αγώνας (επεξεργασία) ή preset (γρήγορη δημιουργία με προ-επιλεγμένες ομάδες)
  const src = row ?? preset ?? null
  const [league, setLeague]   = useState(src?.league_id ?? '')
  const [round, setRound]     = useState(String(row?.round ?? 1))
  const [teamA, setTeamA]     = useState(src?.team_a ?? '')
  const [teamB, setTeamB]     = useState(src?.team_b ?? '')
  // «Εκκρεμεί» πλευρά: placeholder κείμενο αντί για ομάδα (playoff πριν κριθούν οι αντίπαλοι)
  const [phA, setPhA] = useState(src?.placeholder_a ?? '')
  const [phB, setPhB] = useState(src?.placeholder_b ?? '')
  const [modeA, setModeA] = useState<'team' | 'tbd'>(src?.placeholder_a && !src?.team_a ? 'tbd' : 'team')
  const [modeB, setModeB] = useState<'team' | 'tbd'>(src?.placeholder_b && !src?.team_b ? 'tbd' : 'team')
  const [venue, setVenue]     = useState(row?.venue_id ?? '')
  const [field, setField]     = useState(row?.field ?? '')
  const [date, setDate]       = useState(toDatetimeLocal(row?.match_date))
  const [status, setStatus]   = useState<MatchState>(row?.match_status ?? 'Scheduled')
  const [stream, setStream]   = useState(row?.stream_url ?? '')
  const [busy, setBusy]       = useState(false)
  const [showPostpone, setShowPostpone] = useState(false)
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
  const [stage, setStage] = useState<string>(src?.stage ?? 'regular')
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

  // Πλευρά «εκκρεμεί» επιτρέπεται μόνο σε playoff φάση
  const tbdA = stage !== 'regular' && modeA === 'tbd'
  const tbdB = stage !== 'regular' && modeB === 'tbd'

  async function save() {
    if (!league) return toast.error('Διάλεξε πρωτάθλημα')
    const aOk = tbdA ? phA.trim() : teamA
    const bOk = tbdB ? phB.trim() : teamB
    if (!aOk || !bOk)  return toast.error('Συμπλήρωσε ομάδες (ή «εκκρεμεί» στα playoff)')
    if (!tbdA && !tbdB && teamA === teamB) return toast.error('Ίδια ομάδα δύο φορές')
    setBusy(true)

    const payload: any = {
      league_id: league,
      round: parseInt(round) || 1,
      team_a: tbdA ? null : teamA,
      team_b: tbdB ? null : teamB,
      placeholder_a: tbdA ? phA.trim() : null,
      placeholder_b: tbdB ? phB.trim() : null,
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

  // Πλήρες reset: ο αγώνας γυρίζει σαν να μην ξεκίνησε ποτέ — ο σπίκερ ξαναπερνά
  // από συνθέσεις και πρέπει να πατήσει «Έναρξη». Κρατά ομάδες/ημ-νία & τις συνθέσεις.
  async function reset() {
    if (!row) return
    if (!confirm('Πλήρες reset αγώνα;\nΘα μηδενιστεί το σκορ και θα σβηστούν φάσεις (γκολ/κάρτες), αλλαγές, ρολόι και MVP.\nΟ αγώνας γυρίζει στην αρχή: ο σπίκερ θα ξαναπεράσει από τις συνθέσεις και θα πρέπει να πατήσει «Έναρξη».\nΟι ομάδες και η ημερομηνία μένουν.')) return
    setBusy(true)
    await supabase.from('events').delete().eq('match_id', row.match_id)
    const { error } = await supabase.from('matches').update({
      match_status: 'Scheduled',
      goals_team_a: 0, goals_team_b: 0, pens_team_a: 0, pens_team_b: 0,
      clock_period: null, clock_started_at: null,
      subs: [], mvp_player_id: null, report: null,
      squad_set_at: null, squad_set_by: null,
    }).eq('match_id', row.match_id)
    setBusy(false)
    if (error) return toast.error('Δεν έγινε reset: ' + error.message)
    toast.success('Έγινε πλήρες reset'); onSaved()
  }

  // Αναβολή + άδειασμα γηπέδου/ώρας: ο αγώνας μένει (χωρίς ημερομηνία) για να ξαναοριστεί,
  // το slot ελευθερώνεται, και προσμετράται η αναβολή σε όποια ομάδα την πήρε. ΔΕΝ δίνει νίκη στα χαρτιά.
  async function doPostpone(who: 'a' | 'b' | 'both' | 'none') {
    if (!row) return
    setBusy(true)
    const upd = await supabase.from('matches').update({
      match_status: 'Postponed', match_date: null, venue_id: null, field: null,
    }).eq('match_id', row.match_id)
    const bump = async (tid: string) => {
      if (!tid) return
      const cur = teams.find(t => t.team_id === tid)?.postponements ?? 0
      await supabase.from('teams').update({ postponements: cur + 1 }).eq('team_id', tid)
    }
    if (who === 'a' || who === 'both') await bump(teamA)
    if (who === 'b' || who === 'both') await bump(teamB)
    setBusy(false)
    if (upd.error) return toast.error('Δεν έγινε: ' + upd.error.message)
    toast.success('Αναβλήθηκε — το γήπεδο ελευθερώθηκε'); onSaved()
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

      {stage === 'Final' && (
        <p className="text-[9.5px] text-off -mt-1 pl-0.5">
          🏟 Στον τελικό γηπεδούχος τυπικά η ομάδα που τερμάτισε ψηλότερα στην κανονική περίοδο.
        </p>
      )}
      {(stage === 'QF' || stage === 'SF') && (
        <p className="text-[9.5px] text-off -mt-1 pl-0.5">
          🏟 Διπλός αγώνας — φτιάξε 2 ματς εναλλάσσοντας γηπεδούχο/φιλοξενούμενο.
        </p>
      )}
      <SideField label="ΓΗΠΕΔΟΥΧΟΣ" stage={stage} teams={leagueTeams}
        team={teamA} setTeam={setTeamA} ph={phA} setPh={setPhA} mode={modeA} setMode={setModeA} />
      <SideField label="ΦΙΛΟΞΕΝΟΥΜΕΝΟΣ" stage={stage} teams={leagueTeams}
        team={teamB} setTeam={setTeamB} ph={phB} setPh={setPhB} mode={modeB} setMode={setModeB} />

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
        <>
          <button onClick={() => setShowPostpone(v => !v)} disabled={busy}
            className="w-full mt-2 py-2.5 rounded-xl bg-[#c9a227]/15 border border-[#c9a227]/35
              text-[#e8b923] text-[12.5px] font-bold disabled:opacity-50">⏸ Αναβολή & άδειασμα γηπέδου</button>
          {showPostpone && (
            <div className="mt-2 rounded-xl border border-[#c9a227]/35 bg-[#c9a227]/[0.06] p-3 flex flex-col gap-2">
              <p className="text-[10.5px] text-off leading-snug">
                Ποιος πήρε την αναβολή; (προσμετράται στο σύνολο αναβολών της ομάδας). Το γήπεδο/ώρα ελευθερώνεται· ΔΕΝ δίνεται νίκη στα χαρτιά.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['a', `${leagueTeams.find(t => t.team_id === teamA)?.name ?? 'Γηπεδούχος'}`],
                  ['b', `${leagueTeams.find(t => t.team_id === teamB)?.name ?? 'Φιλοξ/νος'}`],
                  ['both', 'Και οι δύο'],
                  ['none', 'Κανένας'],
                ] as const).map(([w, lbl]) => (
                  <button key={w} disabled={busy} onClick={() => doPostpone(w)}
                    className="py-2.5 rounded-lg bg-chalk/[0.06] border border-chalk/[0.08] text-silver text-[11.5px] font-bold truncate disabled:opacity-50">
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button onClick={reset} disabled={busy}
            className="w-full mt-2 py-2.5 rounded-xl bg-[#c9a227]/15 border border-[#c9a227]/35
              text-[#e8b923] text-[12.5px] font-bold disabled:opacity-50">↺ Πλήρες reset (από την αρχή)</button>
          <div className="flex gap-2 mt-2">
            <a href={`/speaker/${row.match_id}`}
              className="flex-1 py-2.5 rounded-xl bg-chalk/[0.05] border border-chalk/[0.08]
                text-silver text-[12.5px] font-bold text-center">🎙 Panel</a>
            <button onClick={onDelete}
              className="flex-1 py-2.5 rounded-xl bg-danger/15 border border-danger/30
                text-danger text-[12.5px] font-bold">Διαγραφή</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// Πλευρά αγώνα: επιλογή ομάδας ή «εκκρεμεί» placeholder (μόνο σε playoff).
function SideField({ label, stage, teams, team, setTeam, ph, setPh, mode, setMode }: {
  label: string; stage: string; teams: Team[]
  team: string; setTeam: (v: string) => void
  ph: string; setPh: (v: string) => void
  mode: 'team' | 'tbd'; setMode: (v: 'team' | 'tbd') => void
}) {
  const presets = stage === 'Final'
    ? ['Νικητής Ημιτελικού Α', 'Νικητής Ημιτελικού Β']
    : stage === 'SF'
    ? ['Νικητής Προημ. 1', 'Νικητής Προημ. 2', 'Νικητής Προημ. 3', 'Νικητής Προημ. 4']
    : stage === 'QF'
    ? ['1ος καν. περιόδου', '2ος', '3ος', '4ος', '5ος', '6ος', '7ος', '8ος']
    : []
  const cls = 'w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm outline-none border border-chalk/[0.07] focus:border-lit/50'
  const isPreset = presets.includes(ph)
  const isTbd = stage !== 'regular' && mode === 'tbd'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 pl-0.5">
        <label className="text-[8.5px] font-extrabold text-dim tracking-[0.12em]">{label}</label>
        {stage !== 'regular' && (
          <div className="flex bg-turf rounded-lg p-[2px] border border-chalk/[0.06]">
            {(['team', 'tbd'] as const).map(mv => (
              <button key={mv} type="button" onClick={() => setMode(mv)}
                className={`px-2.5 py-1 rounded-md text-[9.5px] font-bold ${mode === mv ? 'bg-brand text-chalk' : 'text-dim'}`}>
                {mv === 'team' ? 'Ομάδα' : 'Εκκρεμεί'}
              </button>
            ))}
          </div>
        )}
      </div>
      {!isTbd ? (
        <select value={team} onChange={e => setTeam(e.target.value)} className={cls}>
          <option value="">— Επίλεξε —</option>
          {teams.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
        </select>
      ) : (
        <div className="flex flex-col gap-1.5">
          <select value={isPreset ? ph : '__custom'} className={cls}
            onChange={e => setPh(e.target.value === '__custom' ? '' : e.target.value)}>
            {presets.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="__custom">Άλλο (γράψε)…</option>
          </select>
          {!isPreset && (
            <input value={ph} onChange={e => setPh(e.target.value)}
              placeholder="π.χ. Νικητής Ημιτελικού Α" className={cls} />
          )}
        </div>
      )}
    </div>
  )
}

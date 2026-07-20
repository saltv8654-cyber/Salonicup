'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'
import { Watermark, Crest, Avatar, LiveDot, SectionLabel, Loading } from '@/app/ui'
import {
  PERIODS, EVENTS, PLAY_EVENTS, PEN_EVENTS, fmtMinute, absMinute, toRelativeMinute,
} from '@/lib/match'
import ReportSheet from './report'
import { notifyPush } from '@/lib/push'
import toast from 'react-hot-toast'
import type { Period, EventType, Player } from '@/lib/types'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Side = 'a' | 'b'

export default function SpeakerPanel() {
  const { matchId } = useParams()
  const router = useRouter()
  const { profile, isSpeaker, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { match, events, loading, refresh } = useLiveMatch(matchId as string)

  const [phase, setPhase]     = useState<'squad' | 'live'>('squad')
  const [rosterA, setRosterA] = useState<Player[]>([])
  const [rosterB, setRosterB] = useState<Player[]>([])
  const [inA, setInA]         = useState<Set<string>>(new Set())
  const [inB, setInB]         = useState<Set<string>>(new Set())
  const [notes, setNotes]     = useState<Record<string, string>>({})

  const [period, setPeriod]   = useState<Period>('H1')
  const [minute, setMinute]   = useState('')
  const [side, setSide]       = useState<Side>('a')
  const [pending, setPending] = useState<EventType | null>(null)
  const [chained, setChained] = useState(false)
  const [report, setReport]   = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!authLoading && !isSpeaker) router.replace('/')
  }, [authLoading, isSpeaker])

  // Σχόλια παικτών (μόνο γι' αυτό το ματς) — αρχικοποίηση μία φορά ανά ματς
  useEffect(() => {
    if (match) setNotes(match.player_notes ?? {})
  }, [match?.match_id])

  async function saveNote(playerId: string, text: string) {
    const t = text.trim()
    const nn = { ...notes }
    if (t) nn[playerId] = t; else delete nn[playerId]
    setNotes(nn)
    if (match) await supabase.from('matches').update({ player_notes: nn }).eq('match_id', match.match_id)
  }

  useEffect(() => {
    if (!match) return
    Promise.all([
      supabase.from('players').select('*').eq('team_id', match.team_a)
        .eq('active', true).order('number', { nullsFirst: false }),
      supabase.from('players').select('*').eq('team_id', match.team_b)
        .eq('active', true).order('number', { nullsFirst: false }),
    ]).then(([a, b]) => {
      const byOrder = (x: any, y: any) =>
        (x.sort_order ?? 1e9) - (y.sort_order ?? 1e9) ||
        (x.number ?? 999) - (y.number ?? 999)
      const ra = (a.data ?? []).slice().sort(byOrder)
      const rb = (b.data ?? []).slice().sort(byOrder)
      setRosterA(ra)
      setRosterB(rb)

      // Ξεκινά άδειο· ο σπίκερ προσθέτει όσους συμμετέχουν
      // (αν έχει ήδη αποθηκευτεί σύνθεση, τη φορτώνει)
      const setA = new Set<string>(match.squad_a ?? [])
      const setB = new Set<string>(match.squad_b ?? [])

      setInA(setA)
      setInB(setB)

      if (match.match_status !== 'Scheduled') setPhase('live')
    })
  }, [match?.match_id])

  const score = useMemo(() => ({
    a: match?.goals_team_a ?? 0,
    b: match?.goals_team_b ?? 0,
  }), [match])

  const pens = useMemo(() => ({
    a: match?.pens_team_a ?? 0,
    b: match?.pens_team_b ?? 0,
  }), [match])

  const hasPens = pens.a > 0 || pens.b > 0

  if (loading || authLoading || !match) return <Loading />

  const activeA = rosterA.filter(p => inA.has(p.player_id))
  const activeB = rosterB.filter(p => inB.has(p.player_id))
  const roster  = side === 'a' ? activeA : activeB
  const done    = ['Played', 'Forfeit'].includes(match.match_status)

  /* ── Συνθέσεις ── */
  async function saveSquad() {
    const starting = match.match_status === 'Scheduled'
    setSaving(true)
    const { error } = await supabase.from('matches').update({
      squad_a: [...inA],
      squad_b: [...inB],
      squad_set_at: new Date().toISOString(),
      squad_set_by: profile?.id,
      match_status: starting ? 'Live' : match.match_status,
    }).eq('match_id', match.match_id)
    setSaving(false)

    if (error) { toast.error('Δεν αποθηκεύτηκε'); return }
    if (starting) {
      notifyPush({
        title: '🟢 Έναρξη αγώνα',
        body: `${match.team_a_data?.name} εναντίον ${match.team_b_data?.name} — ${match.league?.name ?? ''}`.trim(),
        url: `/match/${match.match_id}`,
        type: 'start', leagueId: match.league_id,
      })
    }
    toast.success('Συμμετοχές αποθηκεύτηκαν')
    setPhase('live')
  }

  /* ── Καταχώρηση φάσης ── */
  async function commit(playerId: string) {
    if (!pending) return
    const wasGoal = pending === 'GOAL' && period !== 'PEN'
    const min = period === 'PEN' ? null
      : (minute ? toRelativeMinute(period, parseInt(minute)) : null)

    const { error } = await supabase.from('events').insert({
      match_id:   match.match_id,
      team_id:    side === 'a' ? match.team_a : match.team_b,
      player_id:  playerId,
      event_type: pending,
      period,
      minute:     min,
      created_by: profile?.id,
    })

    if (error) { toast.error('Δεν καταχωρήθηκε'); return }

    const teamName = side === 'a' ? match.team_a_data?.name : match.team_b_data?.name
    const pname = roster.find(p => p.player_id === playerId)?.full_name ?? ''
    const vs = `${match.team_a_data?.name} εναντίον ${match.team_b_data?.name}`

    if (wasGoal) {
      notifyPush({
        title: `⚽ ΓΚΟΛ! ${teamName ?? ''}`.trim(),
        body: `${pname}${pname ? ' — ' : ''}${vs}`,
        url: `/match/${match.match_id}`,
        type: 'goal', leagueId: match.league_id,
      })
      // Αλυσίδα: γκολ → ασίστ, ίδιο λεπτό, ίδια ομάδα
      setPending('ASSIST')
      setChained(true)
    } else {
      if (pending === 'RED') {
        notifyPush({
          title: '🟥 Κόκκινη κάρτα',
          body: `${pname} (${teamName}) — ${vs}`,
          url: `/match/${match.match_id}`,
          type: 'red', leagueId: match.league_id,
        })
      }
      setPending(null)
      setChained(false)
      setMinute('')
    }
  }

  function skipAssist() {
    setPending(null)
    setChained(false)
    setMinute('')
  }

  async function removeEvent(id: string) {
    const { error } = await supabase.from('events').delete().eq('event_id', id)
    if (error) { toast.error('Δεν διαγράφηκε'); return }
    refresh()   // άμεση ενημέρωση (το realtime DELETE δεν φτάνει πάντα)
  }

  return (
    <div className="min-h-screen bg-pitch flex flex-col">
      {/* Πίνακας σκορ */}
      <div className="relative bg-turf border-b-2 border-brand overflow-hidden shrink-0">
        <Watermark opacity={0.05} />
        <div className="relative px-3.5 pt-3.5 pb-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => router.push('/speaker')}
              className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center
                text-silver text-base">‹</button>
            <span className="text-[9.5px] text-dim font-bold">
              {match.league?.name} · Αγ. {match.round}
            </span>
            <button onClick={() => router.push('/')} aria-label="Αρχική"
              className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center
                text-silver text-base">🏠</button>
          </div>

          <div className="flex items-start gap-2.5">
            <Badge team={match.team_a_data} n={activeA.length} />
            <div className="shrink-0 text-center pt-1.5">
              <div className="text-[40px] font-extrabold text-chalk leading-none
                tracking-tight tnum">
                {score.a}<span className="text-dim mx-1.5 font-normal">·</span>{score.b}
              </div>
              {hasPens && (
                <div className="text-[11px] font-extrabold text-lit mt-1.5 tnum">
                  πέν. {pens.a}–{pens.b}
                </div>
              )}
              <div className="mt-2">
                {done ? (
                  <span className="text-[9px] font-extrabold text-dim tracking-[0.14em]">
                    ΤΕΛΙΚΟ
                  </span>
                ) : <LiveDot />}
              </div>
            </div>
            <Badge team={match.team_b_data} n={activeB.length} />
          </div>

          {match.setter?.full_name && (
            <p className="text-[9px] text-off text-center mt-3">
              Καταχωρήθηκε από {match.setter.full_name}
            </p>
          )}
        </div>
      </div>

      {phase === 'squad' ? (
        <SquadPicker
          teamA={match.team_a_data} teamB={match.team_b_data}
          teamIdA={match.team_a} teamIdB={match.team_b}
          rosterA={rosterA} rosterB={rosterB}
          setRosterA={setRosterA} setRosterB={setRosterB}
          inA={inA} inB={inB} setInA={setInA} setInB={setInB}
          notes={notes} saveNote={saveNote}
          onSave={saveSquad} saving={saving}
        />
      ) : (
        <>
          <div className="px-3.5 pt-4 pb-3 shrink-0">
            {/* Περίοδος */}
            <div className="flex bg-turf rounded-xl p-[3px] mb-2.5
              border border-chalk/[0.05]">
              {PERIODS.map(P => (
                <button key={P.id}
                  onClick={() => { setPeriod(P.id); setMinute('') }}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-colors
                    ${period === P.id ? 'bg-brand text-chalk' : 'text-dim'}`}>
                  {P.short}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-3 items-end">
              {period !== 'PEN' && (
                <div className="shrink-0">
                  <label className="block text-[8.5px] font-extrabold text-dim
                    tracking-[0.12em] mb-1.5 pl-0.5">
                    ΛΕΠΤΟ{minute ? ` → ${fmtMinute(period, toRelativeMinute(period, parseInt(minute)))}` : ''}
                  </label>
                  <input
                    value={minute}
                    onChange={e => setMinute(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric" placeholder="—"
                    className="w-[60px] bg-turf rounded-xl px-1.5 py-3 text-chalk
                      text-base font-extrabold text-center tnum outline-none
                      border border-chalk/[0.07] focus:border-lit/50
                      placeholder:text-off"
                  />
                </div>
              )}

              <div className="flex-1 flex bg-turf rounded-xl p-[3px]
                border border-chalk/[0.05]">
                {(['a', 'b'] as Side[]).map(s => (
                  <button key={s} onClick={() => setSide(s)}
                    className={`flex-1 py-2.5 px-1.5 rounded-lg text-[12.5px] font-bold
                      truncate transition-colors
                      ${side === s ? 'bg-brand text-chalk' : 'text-dim'}`}>
                    {s === 'a' ? match.team_a_data?.name : match.team_b_data?.name}
                  </button>
                ))}
              </div>
            </div>

            {period !== 'PEN' && (
              <p className="text-[9.5px] text-off text-center mb-2.5">
                Γράψε το πραγματικό λεπτό (π.χ. 58'). Καθυστερήσεις: π.χ. 62' = 60+2'
              </p>
            )}

            {/* Ενέργειες */}
            {period === 'PEN' ? (
              <div className="grid grid-cols-2 gap-2">
                {PEN_EVENTS.map(t => (
                  <button key={t} onClick={() => setPending(t)}
                    className="bg-turf rounded-xl py-3.5 flex flex-col items-center gap-1
                      border border-chalk/[0.05] active:bg-[#1C1C22]">
                    <span className="text-[21px]">{EVENTS[t].icon}</span>
                    <span className="text-[11px] font-extrabold text-silver">
                      {EVENTS[t].label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {PLAY_EVENTS.map(t => (
                  <button key={t} onClick={() => setPending(t)}
                    className="bg-turf rounded-xl py-3 flex flex-col items-center gap-1.5
                      border border-chalk/[0.05] active:bg-[#1C1C22]">
                    <span className="text-[19px]">{EVENTS[t].icon}</span>
                    <span className="text-[9px] font-bold text-silver">
                      {EVENTS[t].label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Περιγραφή */}
          <div className="flex-1 px-3.5 pb-3 overflow-y-auto">
            <SectionLabel>Περιγραφή</SectionLabel>
            {!events.length ? (
              <p className="text-dim text-[13px] text-center py-9">
                Διάλεξε φάση για να την καταχωρήσεις.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {PERIODS.slice().reverse().map(P => {
                  const list = events
                    .filter(e => (e.period ?? 'H1') === P.id)
                    .sort((a, b) =>
                      absMinute(b.period as Period, b.minute) -
                      absMinute(a.period as Period, a.minute))
                  if (!list.length) return null

                  return (
                    <div key={P.id}>
                      <p className="text-[8.5px] font-extrabold text-off
                        tracking-[0.14em] mb-1.5 px-1">
                        {P.label.toUpperCase()}
                      </p>
                      <div className="flex flex-col gap-1">
                        {list.map(e => {
                          const cfg  = EVENTS[e.event_type as EventType]
                          const home = e.team_id === match.team_a
                          return (
                            <div key={e.event_id}
                              className="bg-turf rounded-lg px-3 py-2.5 flex items-center gap-3"
                              style={{ borderLeft: `3px solid ${home ? '#E05B1F' : '#63636E'}` }}>
                              <span className="text-xs font-extrabold text-silver
                                w-9 shrink-0 tnum">
                                {fmtMinute(e.period as Period, e.minute)}
                              </span>
                              <span className="text-base shrink-0">{cfg?.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13.5px] font-semibold text-chalk truncate">
                                  {e.player?.full_name}
                                </p>
                                <p className="text-[10px] text-dim">
                                  {cfg?.label} · {home
                                    ? match.team_a_data?.name
                                    : match.team_b_data?.name}
                                </p>
                              </div>
                              <button onClick={() => removeEvent(e.event_id)}
                                className="w-6 h-6 rounded-md bg-chalk/[0.05] text-dim
                                  text-[10px] shrink-0 grid place-items-center
                                  active:bg-chalk/10">
                                ✕
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="px-3.5 pt-2 pb-6 flex flex-col gap-2 shrink-0">
            <button onClick={() => setReport(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
                text-white font-extrabold text-[15px]
                shadow-[0_4px_16px_rgba(224,91,31,0.3)] active:opacity-90">
              {done ? 'Κείμενο αγώνα' : 'Λήξη αγώνα'}
            </button>
            <button onClick={() => setPhase('squad')}
              className="w-full py-3 rounded-xl text-dim font-semibold text-[12.5px]">
              Αλλαγή συμμετοχών
            </button>
          </div>
        </>
      )}

      {/* Επιλογή παίκτη */}
      {pending && (
        <PlayerSheet
          type={pending}
          players={roster}
          notes={notes}
          teamName={side === 'a' ? match.team_a_data?.name : match.team_b_data?.name}
          minuteLabel={period === 'PEN' ? '' : (minute ? fmtMinute(period, toRelativeMinute(period, parseInt(minute))) : '')}
          chained={chained}
          onPick={commit}
          onSkip={skipAssist}
          onClose={() => { setPending(null); setChained(false) }}
        />
      )}

      {/* Κείμενο αγώνα */}
      {report && (
        <ReportSheet
          match={match}
          events={events}
          onClose={() => setReport(false)}
          onFinished={() => { setReport(false); router.push('/speaker') }}
        />
      )}
    </div>
  )
}

/* ── Ομάδα στο scoreboard ── */
function Badge({ team, n }: { team: any; n: number }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
      <Crest url={team?.logo_url} name={team?.name} size={52} />
      <span className="text-xs font-bold text-chalk text-center leading-tight">
        {team?.name}
      </span>
      <span className="text-[8.5px] text-dim font-bold tracking-[0.04em]">
        {n} ΠΑΙΚΤΕΣ
      </span>
    </div>
  )
}

/* ── Συμμετοχές: μέσα / έξω ── */
/* ── Γραμμή παίκτη με drag ── */
function SortableRow({ p, on, note, onToggle, onEdit }: {
  p: Player; on: boolean; note?: string; onToggle: () => void; onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: p.player_id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 20 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-xl flex items-center border
        ${on ? 'bg-lit/[0.07] border-lit/[0.28]' : 'bg-turf border-transparent'}
        ${isDragging ? 'ring-1 ring-lit/40 bg-turf' : ''}`}>
      <button {...attributes} {...listeners} aria-label="Μετακίνηση"
        className="w-9 self-stretch shrink-0 grid place-items-center text-off text-lg
          touch-none cursor-grab active:cursor-grabbing">⠿</button>
      <button onClick={onToggle}
        className="flex-1 min-w-0 pr-1 py-3 flex items-center gap-3">
        <span className="w-6 text-[12.5px] font-extrabold text-dim text-center shrink-0 tnum">
          {p.number ?? '—'}
        </span>
        <Avatar url={p.photo_url} name={p.full_name} size={28} />
        <span className={`flex-1 text-left min-w-0 ${on ? 'text-chalk' : 'text-chalk/[0.28]'}`}>
          <span className="block text-[14.5px] font-semibold truncate">{p.full_name}</span>
          {note && <span className="block text-[10.5px] text-lit truncate">📝 {note}</span>}
        </span>
        <span className="text-[9px] font-bold text-dim tracking-[0.06em] shrink-0">
          {on ? 'ΣΥΜΜΕΤΟΧΗ' : 'ΕΚΤΟΣ'}
        </span>
      </button>
      <button onClick={onEdit} aria-label="Επεξεργασία"
        className="w-11 self-stretch shrink-0 grid place-items-center text-silver
          text-[15px] active:bg-chalk/[0.06] rounded-r-xl">✎</button>
    </div>
  )
}

function SquadPicker({
  teamA, teamB, teamIdA, teamIdB, rosterA, rosterB, setRosterA, setRosterB,
  inA, inB, setInA, setInB, notes, saveNote, onSave, saving,
}: any) {
  const supabase = createClient()
  const [tab, setTab]       = useState<Side>('a')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)
  const [busy, setBusy]     = useState(false)

  const roster    = tab === 'a' ? rosterA : rosterB
  const setRoster = tab === 'a' ? setRosterA : setRosterB
  const teamId    = tab === 'a' ? teamIdA : teamIdB
  const teamName  = tab === 'a' ? teamA?.name : teamB?.name
  const set       = tab === 'a' ? inA : inB
  const setSet    = tab === 'a' ? setInA : setInB

  const toggle = (id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setSet(next)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  async function persistOrder(list: Player[]) {
    await Promise.all(list.map((p, i) =>
      supabase.from('players').update({ sort_order: i }).eq('player_id', p.player_id)
    )).catch(() => {})
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = roster.findIndex((p: Player) => p.player_id === active.id)
    const newIndex = roster.findIndex((p: Player) => p.player_id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(roster as Player[], oldIndex, newIndex)
    setRoster(next)
    persistOrder(next)
  }

  async function addPlayer(name: string, number: string) {
    setBusy(true)
    const { data, error } = await supabase.from('players').insert({
      full_name: name.trim(),
      number: number ? parseInt(number) : null,
      team_id: teamId,
      active: true,
    }).select().single()
    setBusy(false)

    if (error || !data) { toast.error('Δεν προστέθηκε ο παίκτης'); return }
    setRoster([...roster, data])
    const next = new Set(set); next.add(data.player_id); setSet(next)
    toast.success('Ο παίκτης προστέθηκε')
    setAdding(false)
  }

  async function savePlayer(p: Player, name: string, number: string) {
    setBusy(true)
    const { error } = await supabase.from('players').update({
      full_name: name.trim(),
      number: number ? parseInt(number) : null,
    }).eq('player_id', p.player_id)
    setBusy(false)
    if (error) { toast.error('Δεν αποθηκεύτηκε'); return }
    setRoster(roster.map((x: Player) => x.player_id === p.player_id
      ? { ...x, full_name: name.trim(), number: number ? parseInt(number) : null } : x))
    toast.success('Αποθηκεύτηκε')
    setEditing(null)
  }

  async function deletePlayer(p: Player) {
    if (!confirm(`Αφαίρεση του «${p.full_name}» από το ρόστερ;`)) return
    setBusy(true)
    const { error } = await supabase.from('players').delete().eq('player_id', p.player_id)
    setBusy(false)
    if (error) { toast.error('Δεν αφαιρέθηκε (ίσως έχει φάσεις)'); return }
    setRoster(roster.filter((x: Player) => x.player_id !== p.player_id))
    const next = new Set(set); next.delete(p.player_id); setSet(next)
    toast.success('Αφαιρέθηκε')
    setEditing(null)
  }

  const total = inA.size + inB.size

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3.5 pt-4 pb-3">
        <h2 className="text-base font-bold text-chalk tracking-tight">Συμμετοχές</h2>
        <p className="text-xs text-dim mt-0.5">
          Πάτα παίκτη για να τον βάλεις στη σύνθεση
        </p>
      </div>

      <div className="px-3.5 pb-2.5">
        <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
          {([['a', teamA, inA], ['b', teamB, inB]] as const).map(([s, t, st]) => (
            <button key={s} onClick={() => setTab(s as Side)}
              className={`flex-1 py-2.5 px-1.5 rounded-lg text-[12.5px] font-bold truncate
                ${tab === s ? 'bg-brand text-chalk' : 'text-dim'}`}>
              {t?.name}
              <span className="ml-1.5 text-[11px] opacity-50">{(st as Set<string>).size}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 px-3.5 pb-2.5">
        <button
          onClick={() => setSet(new Set(roster.map((p: Player) => p.player_id)))}
          className="flex-1 py-2 rounded-lg bg-chalk/[0.04] text-[11px]
            font-bold text-silver">
          Όλοι
        </button>
        <button onClick={() => setSet(new Set())}
          className="flex-1 py-2 rounded-lg bg-chalk/[0.04] text-[11px]
            font-bold text-silver">
          Καθαρισμός
        </button>
        <button onClick={() => setAdding(true)}
          className="flex-1 py-2 rounded-lg bg-lit/[0.12] text-[11px]
            font-bold text-lit">
          + Νέος παίκτης
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={roster.map((p: Player) => p.player_id)}
            strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1">
              {roster.map((p: Player) => (
                <SortableRow key={p.player_id} p={p}
                  on={set.has(p.player_id)}
                  note={notes?.[p.player_id]}
                  onToggle={() => toggle(p.player_id)}
                  onEdit={() => setEditing(p)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="p-3.5">
        <button onClick={onSave} disabled={!total || saving}
          className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
            text-white font-extrabold text-[15px] disabled:opacity-25
            shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
          {saving ? 'Αποθήκευση…' : 'Έναρξη αγώνα'}
        </button>
      </div>

      {adding && (
        <AddPlayerSheet
          teamName={teamName} busy={busy}
          onAdd={addPlayer} onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <EditPlayerSheet
          player={editing} busy={busy}
          note={notes?.[editing.player_id] ?? ''}
          onSaveNote={(t: string) => saveNote(editing.player_id, t)}
          onSave={savePlayer} onDelete={deletePlayer}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/* ── Επεξεργασία / αφαίρεση παίκτη ── */
function EditPlayerSheet({ player, busy, note, onSaveNote, onSave, onDelete, onClose }: {
  player: Player; busy: boolean
  note: string
  onSaveNote: (t: string) => void
  onSave: (p: Player, name: string, number: string) => void
  onDelete: (p: Player) => void
  onClose: () => void
}) {
  const [name, setName] = useState(player.full_name)
  const [num, setNum]   = useState(player.number != null ? String(player.number) : '')
  const [noteVal, setNoteVal] = useState(note)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75" />
      <div onClick={e => e.stopPropagation()}
        className="relative bg-turf rounded-t-[20px] flex flex-col
          border-t-2 border-brand p-4 gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-chalk">Επεξεργασία παίκτη</h3>
          <button onClick={onClose}
            className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06]
              grid place-items-center text-silver text-sm">✕</button>
        </div>

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΟΝΟΜΑΤΕΠΩΝΥΜΟ</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
              outline-none border border-chalk/[0.07] focus:border-lit/50" />
        </div>

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΝΟΥΜΕΡΟ</label>
          <input value={num} onChange={e => setNum(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric" placeholder="—"
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
              outline-none border border-chalk/[0.07] focus:border-lit/50" />
        </div>

        {/* Σχόλιο μόνο γι' αυτό το ματς (π.χ. ροζ παπούτσια) */}
        <div>
          <label className="block text-[8.5px] font-extrabold text-lit
            tracking-[0.12em] mb-1.5 pl-0.5">ΣΗΜΕΙΩΣΗ ΓΙΑ ΤΟ ΜΑΤΣ</label>
          <input value={noteVal}
            onChange={e => setNoteVal(e.target.value)}
            onBlur={() => { if (noteVal !== note) onSaveNote(noteVal) }}
            placeholder="π.χ. ροζ παπούτσια, κοτσίδα…"
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
              outline-none border border-lit/25 focus:border-lit/50 placeholder:text-off" />
          <p className="text-[10px] text-off mt-1 pl-0.5">Μένει μόνο γι' αυτόν τον αγώνα.</p>
        </div>

        <button onClick={() => { if (noteVal !== note) onSaveNote(noteVal); onSave(player, name, num) }}
          disabled={busy || !name.trim()}
          className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
            text-white font-extrabold text-[15px] disabled:opacity-40">
          {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        <button onClick={() => onDelete(player)} disabled={busy}
          className="w-full py-3 rounded-xl bg-danger/15 text-danger
            font-bold text-[13px] disabled:opacity-40">
          Αφαίρεση από το ρόστερ
        </button>
      </div>
    </div>
  )
}

/* ── Προσθήκη νέου παίκτη (από τις συνθέσεις) ── */
function AddPlayerSheet({ teamName, busy, onAdd, onClose }: {
  teamName?: string; busy: boolean
  onAdd: (name: string, number: string) => void; onClose: () => void
}) {
  const [name, setName] = useState('')
  const [num, setNum]   = useState('')

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75" />
      <div onClick={e => e.stopPropagation()}
        className="relative bg-turf rounded-t-[20px] flex flex-col
          border-t-2 border-brand p-4 gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-chalk">
            Νέος παίκτης{teamName ? ` · ${teamName}` : ''}
          </h3>
          <button onClick={onClose}
            className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06]
              grid place-items-center text-silver text-sm">✕</button>
        </div>

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΟΝΟΜΑΤΕΠΩΝΥΜΟ</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="Παύλου Γιάννης"
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
              outline-none border border-chalk/[0.07] focus:border-lit/50
              placeholder:text-off" />
        </div>

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΝΟΥΜΕΡΟ</label>
          <input value={num} onChange={e => setNum(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric" placeholder="9"
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
              outline-none border border-chalk/[0.07] focus:border-lit/50
              placeholder:text-off" />
        </div>

        <button onClick={() => onAdd(name, num)} disabled={busy || !name.trim()}
          className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
            text-white font-extrabold text-[15px] disabled:opacity-40
            shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
          {busy ? 'Προσθήκη…' : 'Προσθήκη στη σύνθεση'}
        </button>
      </div>
    </div>
  )
}

/* ── Επιλογή παίκτη ── */
function PlayerSheet({
  type, players, notes, teamName, minuteLabel, chained, onPick, onSkip, onClose,
}: {
  type: EventType; players: Player[]; notes?: Record<string, string>; teamName?: string
  minuteLabel: string; chained: boolean
  onPick: (id: string) => void; onSkip: () => void; onClose: () => void
}) {
  const cfg = EVENTS[type]
  const isAssistChain = chained && type === 'ASSIST'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={isAssistChain ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/75" />
      <div onClick={e => e.stopPropagation()}
        className="relative bg-turf rounded-t-[20px] max-h-[78vh] flex flex-col
          border-t-2 border-brand">

        <div className="px-4.5 pt-4.5 pb-3 shrink-0 border-b border-chalk/[0.06]">
          {isAssistChain && (
            <div className="flex items-center gap-1.5 mb-3 px-2.5 py-2 rounded-lg
              bg-lit/10 border border-lit/[0.22]">
              <span className="text-[13px]">⚽</span>
              <span className="text-[11px] font-bold text-lit">
                Γκολ καταχωρήθηκε{minuteLabel ? ` στο ${minuteLabel}` : ''}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand/[0.18] grid place-items-center text-lg">
              {cfg.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-chalk">
                {isAssistChain ? 'Ποιος έδωσε την ασίστ;' : cfg.label}
              </h3>
              <p className="text-[11px] text-dim mt-0.5">
                {teamName}{minuteLabel ? ` · ${minuteLabel}` : ''}
              </p>
            </div>
            {!isAssistChain && (
              <button onClick={onClose}
                className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06]
                  grid place-items-center text-silver text-sm">✕</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 py-3.5">
          <div className="flex flex-col gap-1">
            {players.map(p => (
              <button key={p.player_id} onClick={() => onPick(p.player_id)}
                className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3.5
                  flex items-center gap-3 active:bg-chalk/[0.09]">
                <span className="w-6 text-[12.5px] font-extrabold text-dim
                  text-center shrink-0 tnum">
                  {p.number ?? '—'}
                </span>
                <Avatar url={p.photo_url} name={p.full_name} size={30} />
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-[14.5px] font-semibold text-chalk truncate">
                    {p.full_name}
                  </span>
                  {notes?.[p.player_id] && (
                    <span className="block text-[11px] text-lit truncate">📝 {notes[p.player_id]}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isAssistChain && (
          <div className="px-3.5 pt-2 pb-6 shrink-0 border-t border-chalk/[0.05]">
            <button onClick={onSkip}
              className="w-full py-3.5 rounded-xl bg-chalk/[0.05] text-silver
                font-bold text-sm">
              Χωρίς ασίστ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

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
import { clockLabel, clockRel, isRunning } from '@/lib/clock'
import { useNow } from '@/lib/hooks/useNow'
import { FORMATIONS, validFormation, normalizeLine } from '@/lib/formations'
import LineupPitch, { shortName } from '@/app/lineup-pitch'
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

  // Διάταξη (γήπεδο) + πάγκος ανά ομάδα
  const [formA, setFormA]   = useState('3-3-1')
  const [formB, setFormB]   = useState('3-3-1')
  const [lineA, setLineA]   = useState<(string | null)[]>([])
  const [lineB, setLineB]   = useState<(string | null)[]>([])
  const [benchA, setBenchA] = useState<string[]>([])
  const [benchB, setBenchB] = useState<string[]>([])

  const [period, setPeriod]   = useState<Period>('H1')
  const [minute, setMinute]   = useState('')
  const [pick, setPick]       = useState<{ player: Player; side: Side } | null>(null)
  const [assistSide, setAssistSide] = useState<Side | null>(null)
  const [entryView, setEntryView]   = useState<'list' | 'pitch'>('list')
  const [pitchSide, setPitchSide]   = useState<Side>('a')
  const [subMode, setSubMode]       = useState<{ side: Side; out: string | null } | null>(null)
  const [report, setReport]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [clockBusy, setClockBusy] = useState(false)
  const now = useNow(1000)

  useEffect(() => {
    if (!authLoading && !isSpeaker) router.replace('/')
  }, [authLoading, isSpeaker])

  // Το ημίχρονο ακολουθεί αυτόματα το ζωντανό χρονόμετρο
  useEffect(() => {
    if (isRunning(match?.clock_period)) setPeriod(match.clock_period as Period)
  }, [match?.clock_period])

  // Αν υπάρχει διάταξη, δείξε το γήπεδο στη ζωντανή καταχώρηση
  useEffect(() => {
    const has = (match?.lineup_a?.filter(Boolean).length ?? 0) > 0
      || (match?.lineup_b?.filter(Boolean).length ?? 0) > 0
    if (has) setEntryView('pitch')
  }, [match?.match_id])

  // Σε λειτουργία ασίστ, το γήπεδο δείχνει την ίδια ομάδα
  useEffect(() => { if (assistSide) setPitchSide(assistSide) }, [assistSide])

  // Έλεγχος χρονομέτρου: cp = φάση, started = αν τρέχει
  async function setClock(cp: string | null, started: boolean) {
    if (!match) return
    setClockBusy(true)
    const payload: any = {
      clock_period: cp,
      clock_started_at: started ? new Date().toISOString() : null,
    }
    if (cp && match.match_status === 'Scheduled') payload.match_status = 'Live'
    const { error } = await supabase.from('matches').update(payload).eq('match_id', match.match_id)
    setClockBusy(false)
    if (error) toast.error('Το χρονόμετρο χρειάζεται ενημέρωση βάσης')
  }

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

      // Διάταξη + πάγκος
      const fA = match.formation_a ?? '3-3-1'
      const fB = match.formation_b ?? '3-3-1'
      const lA = normalizeLine(match.lineup_a, fA)
      const lB = normalizeLine(match.lineup_b, fB)
      setFormA(fA); setFormB(fB)
      setLineA(lA); setLineB(lB)
      const startersA = lA.filter(Boolean) as string[]
      const startersB = lB.filter(Boolean) as string[]
      setBenchA([...setA].filter(id => !startersA.includes(id)))
      setBenchB([...setB].filter(id => !startersB.includes(id)))

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
  const done    = ['Played', 'Forfeit'].includes(match.match_status)

  // Γήπεδο (ζωντανά): θέσεις από τη διάταξη + πάγκος
  const byIdA: Record<string, Player> = Object.fromEntries(rosterA.map(p => [p.player_id, p]))
  const byIdB: Record<string, Player> = Object.fromEntries(rosterB.map(p => [p.player_id, p]))
  const allById: Record<string, Player> = { ...byIdA, ...byIdB }
  const startersLiveA = (match.lineup_a ?? []).filter(Boolean) as string[]
  const startersLiveB = (match.lineup_b ?? []).filter(Boolean) as string[]
  const benchLiveA = activeA.filter(p => !startersLiveA.includes(p.player_id))
  const benchLiveB = activeB.filter(p => !startersLiveB.includes(p.player_id))
  const hasLineupLive = startersLiveA.length > 0 || startersLiveB.length > 0

  /* ── Συνθέσεις ── */
  async function saveSquad() {
    const starting = match.match_status === 'Scheduled'
    const squadA = [...new Set([...(lineA.filter(Boolean) as string[]), ...benchA])]
    const squadB = [...new Set([...(lineB.filter(Boolean) as string[]), ...benchB])]
    setSaving(true)
    // Βασικά (δουλεύει και χωρίς τις νέες στήλες διάταξης)
    const { error } = await supabase.from('matches').update({
      squad_a: squadA,
      squad_b: squadB,
      squad_set_at: new Date().toISOString(),
      squad_set_by: profile?.id,
      match_status: starting ? 'Live' : match.match_status,
    }).eq('match_id', match.match_id)

    // Διάταξη (χρειάζεται νέες στήλες· αν λείπουν, αγνοείται)
    const { error: fErr } = await supabase.from('matches').update({
      formation_a: formA, formation_b: formB,
      lineup_a: lineA, lineup_b: lineB,
    }).eq('match_id', match.match_id)

    setSaving(false)
    if (error) { toast.error('Δεν αποθηκεύτηκε'); return }
    if (fErr) toast('Η διάταξη χρειάζεται ενημέρωση βάσης', { icon: 'ℹ️' })
    setInA(new Set(squadA)); setInB(new Set(squadB))
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

  /* ── Καταχώρηση φάσης (πρώτα παίκτης, μετά φάση) ── */
  async function logEvent(player: Player, ev: EventType, evSide: Side) {
    const isPen = period === 'PEN'
    const wasGoal = ev === 'GOAL' && !isPen
    // Αν δεν γράφτηκε λεπτό, πάρ' το από το ζωντανό χρονόμετρο
    const fromClock = isRunning(match.clock_period) && match.clock_started_at
      ? clockRel(match.clock_started_at) : null
    const min = isPen ? null
      : (minute ? toRelativeMinute(period, parseInt(minute)) : fromClock)

    const { error } = await supabase.from('events').insert({
      match_id:   match.match_id,
      team_id:    evSide === 'a' ? match.team_a : match.team_b,
      player_id:  player.player_id,
      event_type: ev,
      period,
      minute:     min,
      created_by: profile?.id,
    })
    if (error) { toast.error('Δεν καταχωρήθηκε'); return }

    const teamName = evSide === 'a' ? match.team_a_data?.name : match.team_b_data?.name
    const vs = `${match.team_a_data?.name} εναντίον ${match.team_b_data?.name}`

    if (wasGoal) {
      notifyPush({
        title: `⚽ ΓΚΟΛ! ${teamName ?? ''}`.trim(),
        body: `${player.full_name} — ${vs}`,
        url: `/match/${match.match_id}`,
        type: 'goal', leagueId: match.league_id,
      })
      // Αλυσίδα: γκολ → ασίστ, ίδια ομάδα
      setAssistSide(evSide)
    } else if (ev === 'RED') {
      notifyPush({
        title: '🟥 Κόκκινη κάρτα',
        body: `${player.full_name} (${teamName}) — ${vs}`,
        url: `/match/${match.match_id}`,
        type: 'red', leagueId: match.league_id,
      })
    }
    setMinute('')
  }

  // Πάτημα παίκτη: σε λειτουργία ασίστ → ασίστ· αλλιώς → επιλογή φάσης
  function onPlayerTap(player: Player, s: Side) {
    if (assistSide) {
      if (s === assistSide) { logEvent(player, 'ASSIST', s); setAssistSide(null) }
      return
    }
    setPick({ player, side: s })
  }

  function onPickEvent(ev: EventType) {
    if (!pick) return
    const p = pick
    setPick(null)
    logEvent(p.player, ev, p.side)
  }

  // Αλλαγή: ο παίκτης που μπαίνει παίρνει τη θέση αυτού που βγαίνει
  async function substitute(evSide: Side, outPid: string, inPid: string) {
    const line = (evSide === 'a' ? match.lineup_a : match.lineup_b) ?? []
    const nl = line.map((x: string | null) => (x === outPid ? inPid : x))
    const col = evSide === 'a' ? 'lineup_a' : 'lineup_b'
    const { error } = await supabase.from('matches').update({ [col]: nl }).eq('match_id', match.match_id)
    if (error) { toast.error('Δεν καταχωρήθηκε η αλλαγή'); return }

    // Καταγραφή στο ιστορικό (χρειάζεται στήλη subs· αν λείπει, αγνοείται)
    const fromClock = isRunning(match.clock_period) && match.clock_started_at
      ? clockRel(match.clock_started_at) : null
    const min = period === 'PEN' ? null
      : (minute ? toRelativeMinute(period, parseInt(minute)) : fromClock)
    const rec = { side: evSide, out: outPid, in: inPid, period, minute: min, ts: Date.now() }
    await supabase.from('matches').update({ subs: [...(match.subs ?? []), rec] }).eq('match_id', match.match_id)

    const inName = (evSide === 'a' ? byIdA : byIdB)[inPid]?.full_name ?? ''
    toast.success(`Αλλαγή: μπαίνει ${inName}`)
  }

  // Πάτημα παίκτη στο γήπεδο (θέση) — σε λειτουργία αλλαγής επιλέγει ποιος βγαίνει
  function pitchTap(p: Player, s: Side) {
    if (subMode && subMode.side === s) { setSubMode({ side: s, out: p.player_id }); return }
    onPlayerTap(p, s)
  }
  // Πάτημα παίκτη πάγκου — σε λειτουργία αλλαγής (αφού διαλέξεις έξοδο) μπαίνει
  function benchTap(p: Player, s: Side) {
    if (subMode && subMode.side === s) {
      if (subMode.out) { substitute(s, subMode.out, p.player_id); setSubMode(null) }
      return
    }
    onPlayerTap(p, s)
  }

  async function removeEvent(id: string) {
    const { error } = await supabase.from('events').delete().eq('event_id', id)
    if (error) { toast.error('Δεν διαγράφηκε'); return }
    refresh()   // άμεση ενημέρωση (το realtime DELETE δεν φτάνει πάντα)
  }

  async function undoLast() {
    if (!events.length) return
    const last = [...events].sort((a, b) =>
      (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0]
    const label = EVENTS[last.event_type as EventType]?.label ?? 'φάση'
    if (!confirm(`Αναίρεση: ${label}${last.player?.full_name ? ` — ${last.player.full_name}` : ''};`)) return
    await removeEvent(last.event_id)
    toast.success('Αναιρέθηκε')
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
        <LineupBuilder
          teamA={match.team_a_data} teamB={match.team_b_data}
          teamIdA={match.team_a} teamIdB={match.team_b}
          rosterA={rosterA} rosterB={rosterB}
          setRosterA={setRosterA} setRosterB={setRosterB}
          formA={formA} formB={formB} setFormA={setFormA} setFormB={setFormB}
          lineA={lineA} lineB={lineB} setLineA={setLineA} setLineB={setLineB}
          benchA={benchA} benchB={benchB} setBenchA={setBenchA} setBenchB={setBenchB}
          notes={notes} saveNote={saveNote}
          onSave={saveSquad} saving={saving}
        />
      ) : (
        <>
          <div className="px-3.5 pt-3.5 shrink-0">
            <ClockBar cp={match.clock_period} startedAt={match.clock_started_at}
              now={now} busy={clockBusy} onSet={setClock} />
          </div>
          <div className="px-3.5 pt-3 pb-3 shrink-0">
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

            {entryView !== 'pitch' && (
              <>
                {period !== 'PEN' ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={minute}
                      onChange={e => setMinute(e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric" placeholder="Λεπτό (αυτόματο από χρονόμετρο)"
                      className="flex-1 bg-turf rounded-xl px-3 py-2.5 text-chalk
                        text-[13px] font-bold text-center tnum outline-none
                        border border-chalk/[0.07] focus:border-lit/50
                        placeholder:text-off placeholder:font-normal"
                    />
                    {minute && (
                      <span className="text-[11px] font-bold text-lit shrink-0">
                        → {fmtMinute(period, toRelativeMinute(period, parseInt(minute)))}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-off text-center py-1">
                    Πέναλτι: πάτα παίκτη → Εύστοχο / Άστοχο
                  </p>
                )}
                <p className="text-[9.5px] text-off text-center mt-1.5">
                  Πάτα τον <b className="text-silver">παίκτη</b> → μετά τη φάση. Το λεπτό μπαίνει μόνο του.
                </p>
              </>
            )}
          </div>

          {/* Ασίστ; (μετά από γκολ) */}
          {assistSide && (
            <div className="mx-3.5 mb-1.5 flex items-center gap-2 px-3 py-2 rounded-xl
              bg-lit/10 border border-lit/30 shrink-0">
              <span className="text-[14px]">🅰</span>
              <span className="flex-1 text-[12px] font-bold text-lit truncate">
                Ασίστ; διάλεξε παίκτη — {assistSide === 'a' ? match.team_a_data?.name : match.team_b_data?.name}
              </span>
              <button onClick={() => setAssistSide(null)}
                className="shrink-0 text-[11px] font-bold text-silver bg-chalk/[0.06]
                  rounded-lg px-2.5 py-1.5">
                Χωρίς ασίστ
              </button>
            </div>
          )}

          {/* Διακόπτης Γήπεδο / Λίστα (αν υπάρχει διάταξη) */}
          {hasLineupLive && (
            <div className="px-3.5 pb-2 shrink-0">
              <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
                {(['pitch', 'list'] as const).map(v => (
                  <button key={v} onClick={() => setEntryView(v)}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition-colors
                      ${entryView === v ? 'bg-brand text-chalk' : 'text-dim'}`}>
                    {v === 'pitch' ? '⚽ Γήπεδο' : 'Λίστα'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entryView === 'pitch' && hasLineupLive ? (
            /* Γήπεδο: πάτα παίκτη πάνω στο γήπεδο */
            <div className="px-3.5 pb-2 flex-1 min-h-0 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
                  {(['a', 'b'] as Side[]).map(s => (
                    <button key={s} onClick={() => { setPitchSide(s); setSubMode(null) }}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-bold truncate transition-colors
                        ${pitchSide === s ? 'bg-brand text-chalk' : 'text-dim'}`}>
                      {s === 'a' ? match.team_a_data?.name : match.team_b_data?.name}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setSubMode(subMode ? null : { side: pitchSide, out: null })}
                  className={`shrink-0 px-3 py-2.5 rounded-xl text-[12px] font-bold
                    ${subMode ? 'bg-danger/15 text-danger' : 'bg-chalk/[0.06] text-silver border border-chalk/[0.08]'}`}>
                  {subMode ? '✕ Άκυρο' : '🔄 Αλλαγή'}
                </button>
              </div>

              {subMode && (
                <div className="mb-2 px-3 py-2 rounded-xl bg-lit/10 border border-lit/30
                  text-[12px] font-bold text-lit">
                  {subMode.out
                    ? `Βγαίνει: ${(pitchSide === 'a' ? byIdA : byIdB)[subMode.out]?.full_name ?? ''} → διάλεξε ποιος μπαίνει (πάγκος)`
                    : 'Διάλεξε ποιος βγαίνει (από το γήπεδο)'}
                </div>
              )}

              <LineupPitch
                formation={(pitchSide === 'a' ? match.formation_a : match.formation_b) ?? '3-3-1'}
                line={(pitchSide === 'a' ? match.lineup_a : match.lineup_b) ?? []}
                players={pitchSide === 'a' ? byIdA : byIdB}
                accent={pitchSide === 'a' ? '#E05B1F' : '#3E6DDB'}
                notes={notes}
                onSlot={(i) => {
                  const line = (pitchSide === 'a' ? match.lineup_a : match.lineup_b) ?? []
                  const pid = line[i]
                  if (!pid) return
                  const p = (pitchSide === 'a' ? byIdA : byIdB)[pid]
                  if (p) pitchTap(p, pitchSide)
                }}
              />
              {(pitchSide === 'a' ? benchLiveA : benchLiveB).length > 0 && (
                <div className="mt-2">
                  <p className="text-[9px] font-extrabold text-dim tracking-[0.1em] mb-1.5">
                    ΠΑΓΚΟΣ {subMode?.out ? '· πάτα ποιος μπαίνει' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(pitchSide === 'a' ? benchLiveA : benchLiveB).map(p => (
                      <button key={p.player_id} onClick={() => benchTap(p, pitchSide)}
                        className={`flex items-center gap-1.5 bg-turf border rounded-lg pl-1.5 pr-2 py-1.5
                          active:bg-brand/25 ${subMode?.out ? 'border-lit/50' : 'border-chalk/[0.06]'}`}>
                        <span className="text-[11px] font-extrabold text-dim tnum">{p.number ?? '·'}</span>
                        <span className="text-[12px] font-semibold text-chalk">{shortName(p.full_name)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Λίστα: ονόματα ανά ομάδα */
            <div className="px-3.5 pb-2 shrink-0 max-h-[42vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 items-start">
                <TeamGrid name={match.team_a_data?.name} players={activeA} side="a"
                  notes={notes} dimmed={assistSide === 'b'} onTap={onPlayerTap} />
                <TeamGrid name={match.team_b_data?.name} players={activeB} side="b"
                  notes={notes} dimmed={assistSide === 'a'} onTap={onPlayerTap} />
              </div>
            </div>
          )}

          {/* Περιγραφή */}
          <div className={`px-3.5 pb-3 overflow-y-auto
            ${entryView === 'pitch' && hasLineupLive ? 'shrink-0 max-h-[17vh]' : 'flex-1'}`}>
            <div className="flex items-center gap-2">
              <div className="flex-1"><SectionLabel>Περιγραφή</SectionLabel></div>
              {events.length > 0 && (
                <button onClick={undoLast}
                  className="mb-2.5 shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                    bg-chalk/[0.05] text-silver text-[11px] font-bold active:bg-chalk/10">
                  ↶ Αναίρεση
                </button>
              )}
            </div>
            {!events.length && !(match.subs?.length) ? (
              <p className="text-dim text-[13px] text-center py-9">
                Πάτα παίκτη για να καταχωρήσεις φάση.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {PERIODS.slice().reverse().map(P => {
                  const evs = events
                    .filter(e => (e.period ?? 'H1') === P.id)
                    .map(e => ({ kind: 'event' as const, e, min: absMinute(P.id, e.minute) }))
                  const sbs = (match.subs ?? [])
                    .filter((s: any) => (s.period ?? 'H1') === P.id)
                    .map((s: any) => ({ kind: 'sub' as const, s, min: absMinute(P.id, s.minute) }))
                  const all = [...evs, ...sbs].sort((a, b) => b.min - a.min)
                  if (!all.length) return null

                  return (
                    <div key={P.id}>
                      <p className="text-[8.5px] font-extrabold text-off
                        tracking-[0.14em] mb-1.5 px-1">
                        {P.label.toUpperCase()}
                      </p>
                      <div className="flex flex-col gap-1">
                        {all.map(item => item.kind === 'event' ? (() => {
                          const e = item.e
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
                        })() : (
                          <div key={`sub-${item.s.ts}`}
                            className="bg-turf rounded-lg px-3 py-2.5 flex items-center gap-3"
                            style={{ borderLeft: `3px solid ${item.s.side === 'a' ? '#E05B1F' : '#63636E'}` }}>
                            <span className="text-xs font-extrabold text-silver w-9 shrink-0 tnum">
                              {fmtMinute(P.id, item.s.minute)}
                            </span>
                            <span className="text-base shrink-0">🔄</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-chalk truncate">
                                <span className="text-lit">▲ {allById[item.s.in]?.full_name ?? '—'}</span>
                              </p>
                              <p className="text-[10px] text-dim truncate">
                                ▼ {allById[item.s.out]?.full_name ?? '—'}
                              </p>
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

      {/* Επιλογή φάσης για τον παίκτη */}
      {pick && (
        <EventSheet
          player={pick.player}
          teamName={pick.side === 'a' ? match.team_a_data?.name : match.team_b_data?.name}
          minuteLabel={period === 'PEN' ? '' :
            (minute ? fmtMinute(period, toRelativeMinute(period, parseInt(minute)))
              : (isRunning(match.clock_period) && match.clock_started_at
                  ? fmtMinute(period, clockRel(match.clock_started_at)) : ''))}
          isPen={period === 'PEN'}
          onPick={onPickEvent}
          onClose={() => setPick(null)}
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
/* ── Χρονόμετρο αγώνα ── */
function ClockBar({ cp, startedAt, now, busy, onSet }: {
  cp: string | null; startedAt: string | null; now: number; busy: boolean
  onSet: (cp: string | null, started: boolean) => void
}) {
  const label = clockLabel(cp, startedAt, now)
  const running = isRunning(cp)

  const Big = ({ children, onClick, tone = 'go' }: {
    children: React.ReactNode; onClick: () => void; tone?: 'go' | 'stop' | 'soft'
  }) => (
    <button onClick={onClick} disabled={busy}
      className={`flex-1 py-3 rounded-xl text-[13px] font-extrabold disabled:opacity-50
        ${tone === 'go' ? 'bg-brand text-chalk'
          : tone === 'stop' ? 'bg-danger/15 text-danger'
          : 'bg-turf border border-chalk/[0.08] text-silver'}`}>
      {children}
    </button>
  )

  return (
    <div className="flex items-center gap-2 rounded-xl bg-turf border border-chalk/[0.06] p-2">
      {/* Ένδειξη */}
      <div className="shrink-0 w-[74px] text-center">
        {running ? (
          <div className="flex items-center justify-center gap-1.5">
            <LiveDot />
            <span className="text-[18px] font-extrabold text-chalk tnum leading-none">{label}</span>
          </div>
        ) : (
          <span className="text-[12px] font-extrabold text-dim tracking-[0.12em]">
            {label ?? '—'}
          </span>
        )}
      </div>

      {/* Κουμπιά ανάλογα με τη φάση */}
      <div className="flex-1 flex gap-2">
        {!cp && <Big onClick={() => onSet('H1', true)}>▶ Έναρξη Α΄</Big>}
        {cp === 'H1' && <Big tone="stop" onClick={() => onSet('HT', false)}>⏸ Ημίχρονο</Big>}
        {cp === 'HT' && <Big onClick={() => onSet('H2', true)}>▶ Έναρξη Β΄</Big>}
        {cp === 'H2' && <>
          <Big tone="soft" onClick={() => onSet('ET', true)}>Παράταση</Big>
          <Big tone="stop" onClick={() => onSet('FT', false)}>⏹ Λήξη</Big>
        </>}
        {cp === 'ET' && <Big tone="stop" onClick={() => onSet('FT', false)}>⏹ Λήξη</Big>}
        {cp === 'FT' && <Big tone="soft" onClick={() => onSet(null, false)}>↺ Επαναφορά</Big>}
      </div>
    </div>
  )
}

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

/* ── Στήσιμο σύνθεσης σε γήπεδο (διάταξη + θέσεις + πάγκος) ── */
function LineupBuilder({
  teamA, teamB, teamIdA, teamIdB, rosterA, rosterB, setRosterA, setRosterB,
  formA, formB, setFormA, setFormB, lineA, lineB, setLineA, setLineB,
  benchA, benchB, setBenchA, setBenchB, notes, saveNote, onSave, saving,
}: any) {
  const supabase = createClient()
  const [tab, setTab] = useState<Side>('a')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)
  const [busy, setBusy] = useState(false)
  const [assign, setAssign] = useState<{ mode: 'slot' | 'bench'; slot?: number } | null>(null)
  const [customForms, setCustomForms] = useState<string[]>([])

  useEffect(() => {
    try { setCustomForms(JSON.parse(localStorage.getItem('formations') || '[]')) } catch {}
  }, [])

  const roster   = tab === 'a' ? rosterA : rosterB
  const setRoster = tab === 'a' ? setRosterA : setRosterB
  const teamId   = tab === 'a' ? teamIdA : teamIdB
  const teamName = tab === 'a' ? teamA?.name : teamB?.name
  const form     = tab === 'a' ? formA : formB
  const setForm  = tab === 'a' ? setFormA : setFormB
  const line: (string | null)[] = tab === 'a' ? lineA : lineB
  const setLine  = tab === 'a' ? setLineA : setLineB
  const bench: string[] = tab === 'a' ? benchA : benchB
  const setBench = tab === 'a' ? setBenchA : setBenchB

  const byId: Record<string, Player> = Object.fromEntries(roster.map((p: Player) => [p.player_id, p]))
  const placed = new Set(line.filter(Boolean) as string[])
  const allForms = [...FORMATIONS, ...customForms.filter(f => !FORMATIONS.includes(f))]

  function changeForm(f: string) { setForm(f); setLine(normalizeLine(line, f)) }

  function addCustomForm() {
    const f = prompt('Νέα διάταξη (π.χ. 2-3-2):')?.trim()
    if (!f) return
    if (!validFormation(f)) { toast.error('Μη έγκυρη διάταξη'); return }
    const next = [...new Set([...customForms, f])]
    setCustomForms(next); localStorage.setItem('formations', JSON.stringify(next))
    changeForm(f)
  }

  function assignPlayer(pid: string) {
    if (!assign) return
    if (assign.mode === 'slot' && assign.slot != null) {
      const nl = line.map(x => (x === pid ? null : x))
      nl[assign.slot] = pid
      setLine(nl)
      setBench(bench.filter(b => b !== pid))
    } else {
      if (line.includes(pid)) setLine(line.map(x => (x === pid ? null : x)))
      if (!bench.includes(pid)) setBench([...bench, pid])
    }
    setAssign(null)
  }
  function clearSlot(i: number) { const nl = [...line]; nl[i] = null; setLine(nl) }
  function removeBench(pid: string) { setBench(bench.filter(b => b !== pid)) }

  async function addPlayer(name: string, number: string) {
    setBusy(true)
    const { data, error } = await supabase.from('players').insert({
      full_name: name.trim(), number: number ? parseInt(number) : null,
      team_id: teamId, active: true,
    }).select().single()
    setBusy(false)
    if (error || !data) { toast.error('Δεν προστέθηκε ο παίκτης'); return }
    setRoster([...roster, data])
    setBench([...bench, data.player_id])
    toast.success('Ο παίκτης προστέθηκε στον πάγκο'); setAdding(false)
  }
  async function savePlayer(p: Player, name: string, number: string) {
    setBusy(true)
    const { error } = await supabase.from('players').update({
      full_name: name.trim(), number: number ? parseInt(number) : null,
    }).eq('player_id', p.player_id)
    setBusy(false)
    if (error) { toast.error('Δεν αποθηκεύτηκε'); return }
    setRoster(roster.map((x: Player) => x.player_id === p.player_id
      ? { ...x, full_name: name.trim(), number: number ? parseInt(number) : null } : x))
    toast.success('Αποθηκεύτηκε'); setEditing(null)
  }
  async function deletePlayer(p: Player) {
    if (!confirm(`Αφαίρεση του «${p.full_name}» από το ρόστερ;`)) return
    setBusy(true)
    const { error } = await supabase.from('players').delete().eq('player_id', p.player_id)
    setBusy(false)
    if (error) { toast.error('Δεν αφαιρέθηκε (ίσως έχει φάσεις)'); return }
    setRoster(roster.filter((x: Player) => x.player_id !== p.player_id))
    setLine(line.map(x => (x === p.player_id ? null : x)))
    setBench(bench.filter(b => b !== p.player_id))
    setEditing(null)
  }

  const starters = line.filter(Boolean).length
  const benchPlayers = bench.map(id => byId[id]).filter(Boolean) as Player[]
  const totalStarters = (lineA.filter(Boolean).length as number) + (lineB.filter(Boolean).length as number)
  const accent = tab === 'a' ? '#E05B1F' : '#3E6DDB'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3.5 pt-3.5 pb-2">
        <h2 className="text-base font-bold text-chalk tracking-tight">Σύνθεση & Διάταξη</h2>
        <p className="text-[11px] text-dim mt-0.5">Διάλεξε διάταξη, πάτα θέση → βάλε παίκτη.</p>
      </div>

      {/* Ομάδα */}
      <div className="px-3.5 pb-2">
        <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
          {([['a', teamA], ['b', teamB]] as const).map(([s, t]) => (
            <button key={s} onClick={() => setTab(s as Side)}
              className={`flex-1 py-2.5 px-1.5 rounded-lg text-[12.5px] font-bold truncate
                ${tab === s ? 'bg-brand text-chalk' : 'text-dim'}`}>
              {t?.name}
              <span className="ml-1.5 text-[11px] opacity-50">
                {(s === 'a' ? lineA : lineB).filter(Boolean).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Διάταξη */}
      <div className="px-3.5 pb-2 flex gap-1.5 overflow-x-auto">
        {allForms.map(f => (
          <button key={f} onClick={() => changeForm(f)}
            className={`shrink-0 px-3 py-2 rounded-lg text-[12px] font-extrabold tnum
              ${form === f ? 'bg-brand text-chalk' : 'bg-turf text-dim border border-chalk/[0.06]'}`}>
            {f}
          </button>
        ))}
        <button onClick={addCustomForm}
          className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-extrabold
            bg-lit/[0.12] text-lit">＋</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 pb-3">
        {/* Γήπεδο */}
        <LineupPitch formation={form} line={line} players={byId} accent={accent} notes={notes}
          onSlot={(i) => setAssign({ mode: 'slot', slot: i })} />

        {/* Πάγκος / Αλλαγές */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-extrabold text-dim tracking-[0.12em]">
              ΠΑΓΚΟΣ / ΑΛΛΑΓΕΣ
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => setAdding(true)}
                className="text-[11px] font-bold text-lit bg-lit/[0.12] rounded-lg px-2.5 py-1.5">
                + Νέος
              </button>
              <button onClick={() => setAssign({ mode: 'bench' })}
                className="text-[11px] font-bold text-silver bg-chalk/[0.06] rounded-lg px-2.5 py-1.5">
                + Πάγκος
              </button>
            </div>
          </div>
          {benchPlayers.length === 0 ? (
            <p className="text-[11px] text-off py-2">Κανείς στον πάγκο.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {benchPlayers.map(p => (
                <span key={p.player_id}
                  className="flex items-center gap-1.5 bg-turf border border-chalk/[0.06]
                    rounded-lg pl-2 pr-1 py-1.5">
                  <span className="text-[11px] font-extrabold text-dim tnum">{p.number ?? '·'}</span>
                  <span className="text-[12px] font-semibold text-chalk">{shortName(p.full_name)}</span>
                  <button onClick={() => setEditing(p)}
                    className="w-5 h-5 grid place-items-center text-silver text-[11px]">✎</button>
                  <button onClick={() => removeBench(p.player_id)}
                    className="w-5 h-5 grid place-items-center text-dim text-[11px]">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-3.5">
        <button onClick={onSave} disabled={!totalStarters || saving}
          className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
            text-white font-extrabold text-[15px] disabled:opacity-25
            shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
          {saving ? 'Αποθήκευση…' : 'Έναρξη αγώνα'}
        </button>
        <p className="text-[10px] text-off text-center mt-1.5">
          {teamName}: {starters} βασικοί · {benchPlayers.length} πάγκος
        </p>
      </div>

      {assign && (
        <RosterSheet
          title={assign.mode === 'bench' ? 'Πρόσθεσε στον πάγκο' : `Θέση ${assign.slot === 0 ? 'Τερματοφύλακα' : assign.slot}`}
          teamName={teamName}
          players={roster} notes={notes} placed={placed} bench={new Set(bench)}
          showClear={assign.mode === 'slot' && assign.slot != null && !!line[assign.slot!]}
          onPick={assignPlayer}
          onClear={() => { if (assign.slot != null) clearSlot(assign.slot); setAssign(null) }}
          onAdd={() => { setAssign(null); setAdding(true) }}
          onEdit={(p: Player) => { setAssign(null); setEditing(p) }}
          onClose={() => setAssign(null)}
        />
      )}

      {adding && (
        <AddPlayerSheet teamName={teamName} busy={busy}
          onAdd={addPlayer} onClose={() => setAdding(false)} />
      )}
      {editing && (
        <EditPlayerSheet player={editing} busy={busy}
          note={notes?.[editing.player_id] ?? ''}
          onSaveNote={(t: string) => saveNote(editing.player_id, t)}
          onSave={savePlayer} onDelete={deletePlayer}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

/* ── Επιλογή παίκτη για θέση/πάγκο ── */
function RosterSheet({ title, teamName, players, notes, placed, bench, showClear, onPick, onClear, onAdd, onEdit, onClose }: {
  title: string; teamName?: string; players: Player[]; notes?: Record<string, string>
  placed: Set<string>; bench: Set<string>; showClear?: boolean
  onPick: (id: string) => void; onClear: () => void; onAdd: () => void
  onEdit: (p: Player) => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75" />
      <div onClick={e => e.stopPropagation()}
        className="relative bg-turf rounded-t-[20px] max-h-[80vh] flex flex-col border-t-2 border-brand">
        <div className="px-4.5 pt-4.5 pb-3 shrink-0 border-b border-chalk/[0.06] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-chalk truncate">{title}</h3>
            <p className="text-[11px] text-dim">{teamName}</p>
          </div>
          <button onClick={onAdd}
            className="text-[11px] font-bold text-lit bg-lit/[0.12] rounded-lg px-2.5 py-2 shrink-0">
            + Νέος
          </button>
          <button onClick={onClose}
            className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center text-silver text-sm shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-3.5 py-3">
          {showClear && (
            <button onClick={onClear}
              className="w-full mb-2 py-3 rounded-xl bg-danger/15 text-danger font-bold text-[13px]">
              Άδειασε τη θέση
            </button>
          )}
          <div className="flex flex-col gap-1">
            {players.map((p: Player) => {
              const inSlot = placed.has(p.player_id)
              const onBench = bench.has(p.player_id)
              return (
                <div key={p.player_id}
                  className="w-full bg-chalk/[0.04] rounded-xl flex items-center">
                  <button onClick={() => onPick(p.player_id)}
                    className="flex-1 min-w-0 px-3.5 py-3 flex items-center gap-3 text-left active:bg-chalk/[0.09] rounded-l-xl">
                    <span className="w-6 text-[12.5px] font-extrabold text-dim text-center shrink-0 tnum">
                      {p.number ?? '—'}
                    </span>
                    <Avatar url={p.photo_url} name={p.full_name} size={30} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-chalk truncate">{p.full_name}</span>
                      {notes?.[p.player_id] && (
                        <span className="block text-[11px] text-lit truncate">📝 {notes[p.player_id]}</span>
                      )}
                    </span>
                    {(inSlot || onBench) && (
                      <span className={`text-[8.5px] font-extrabold shrink-0 tracking-[0.06em]
                        ${inSlot ? 'text-lit' : 'text-dim'}`}>
                        {inSlot ? 'ΓΗΠΕΔΟ' : 'ΠΑΓΚΟΣ'}
                      </span>
                    )}
                  </button>
                  <button onClick={() => onEdit(p)}
                    className="w-11 self-stretch grid place-items-center text-silver text-[15px] active:bg-chalk/[0.06] rounded-r-xl shrink-0">✎</button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
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
/* ── Πλέγμα ομάδας: ονόματα μόνιμα ορατά, tap = επιλογή παίκτη ── */
function TeamGrid({ name, players, side, notes, dimmed, onTap }: {
  name?: string; players: Player[]; side: Side; notes?: Record<string, string>
  dimmed?: boolean; onTap: (p: Player, s: Side) => void
}) {
  return (
    <div className={dimmed ? 'opacity-35 pointer-events-none' : ''}>
      <p className="text-[9px] font-extrabold text-dim tracking-[0.08em] mb-1.5 px-0.5 truncate">
        {name?.toUpperCase()}
      </p>
      <div className="flex flex-col gap-1">
        {players.length === 0 ? (
          <p className="text-[10px] text-off px-1 py-2">— χωρίς παίκτες —</p>
        ) : players.map(p => (
          <button key={p.player_id} onClick={() => onTap(p, side)}
            className="w-full bg-turf rounded-lg pl-1.5 pr-2 py-2 flex items-center gap-1.5
              border border-chalk/[0.05] active:bg-brand/25 text-left">
            <span className="w-5 text-[11px] font-extrabold text-dim text-center shrink-0 tnum">
              {p.number ?? '·'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-semibold text-chalk truncate leading-tight">
                {p.full_name}
              </span>
              {notes?.[p.player_id] && (
                <span className="block text-[9px] text-lit truncate leading-tight">📝 {notes[p.player_id]}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Επιλογή φάσης για τον επιλεγμένο παίκτη ── */
function EventSheet({ player, teamName, minuteLabel, isPen, onPick, onClose }: {
  player: Player; teamName?: string; minuteLabel: string; isPen: boolean
  onPick: (ev: EventType) => void; onClose: () => void
}) {
  const opts = isPen ? PEN_EVENTS : PLAY_EVENTS
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75" />
      <div onClick={e => e.stopPropagation()}
        className="relative bg-turf rounded-t-[20px] flex flex-col border-t-2 border-brand pb-7">
        <div className="px-4.5 pt-4.5 pb-3 flex items-center gap-3 border-b border-chalk/[0.06]">
          <Avatar url={player.photo_url} name={player.full_name} size={40} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-chalk truncate">{player.full_name}</h3>
            <p className="text-[11px] text-dim mt-0.5">
              {teamName}{minuteLabel ? ` · ${minuteLabel}` : ''}
            </p>
          </div>
          <button onClick={onClose}
            className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06]
              grid place-items-center text-silver text-sm shrink-0">✕</button>
        </div>
        <div className={`px-3.5 py-4 grid gap-2 ${isPen ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {opts.map(t => (
            <button key={t} onClick={() => onPick(t)}
              className="bg-chalk/[0.04] rounded-xl py-4 flex flex-col items-center gap-1.5
                border border-chalk/[0.05] active:bg-chalk/[0.09]">
              <span className="text-[26px]">{EVENTS[t].icon}</span>
              <span className="text-[11px] font-bold text-silver">{EVENTS[t].label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

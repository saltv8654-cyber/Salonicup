'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'
import { Watermark, Crest, Avatar, LiveDot, SectionLabel, Loading } from '@/app/ui'
import {
  PERIODS, EVENTS, PLAY_EVENTS, PEN_EVENTS, fmtMinute, absMinute,
} from '@/lib/match'
import ReportSheet from './report'
import toast from 'react-hot-toast'
import type { Period, EventType, Player } from '@/lib/types'

type Side = 'a' | 'b'

export default function SpeakerPanel() {
  const { matchId } = useParams()
  const router = useRouter()
  const { profile, isSpeaker, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { match, events, loading } = useLiveMatch(matchId as string)

  const [phase, setPhase]     = useState<'squad' | 'live'>('squad')
  const [rosterA, setRosterA] = useState<Player[]>([])
  const [rosterB, setRosterB] = useState<Player[]>([])
  const [inA, setInA]         = useState<Set<string>>(new Set())
  const [inB, setInB]         = useState<Set<string>>(new Set())

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

  useEffect(() => {
    if (!match) return
    Promise.all([
      supabase.from('players').select('*').eq('team_id', match.team_a)
        .eq('active', true).order('number', { nullsFirst: false }),
      supabase.from('players').select('*').eq('team_id', match.team_b)
        .eq('active', true).order('number', { nullsFirst: false }),
    ]).then(([a, b]) => {
      const ra = a.data ?? []
      const rb = b.data ?? []
      setRosterA(ra)
      setRosterB(rb)

      const setA = match.squad_a?.length
        ? new Set<string>(match.squad_a)
        : new Set<string>(ra.map(p => p.player_id))
      const setB = match.squad_b?.length
        ? new Set<string>(match.squad_b)
        : new Set<string>(rb.map(p => p.player_id))

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
    setSaving(true)
    const { error } = await supabase.from('matches').update({
      squad_a: [...inA],
      squad_b: [...inB],
      squad_set_at: new Date().toISOString(),
      squad_set_by: profile?.id,
      match_status: match.match_status === 'Scheduled' ? 'Live' : match.match_status,
    }).eq('match_id', match.match_id)
    setSaving(false)

    if (error) { toast.error('Δεν αποθηκεύτηκε'); return }
    toast.success('Συμμετοχές αποθηκεύτηκαν')
    setPhase('live')
  }

  /* ── Καταχώρηση φάσης ── */
  async function commit(playerId: string) {
    if (!pending) return
    const wasGoal = pending === 'GOAL' && period !== 'PEN'
    const min = period === 'PEN' ? null : (minute ? parseInt(minute) : null)

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

    if (wasGoal) {
      // Αλυσίδα: γκολ → ασίστ, ίδιο λεπτό, ίδια ομάδα
      setPending('ASSIST')
      setChained(true)
    } else {
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
    if (error) toast.error('Δεν διαγράφηκε')
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
            <div className="w-[30px]" />
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
        </div>
      </div>

      {phase === 'squad' ? (
        <SquadPicker
          teamA={match.team_a_data} teamB={match.team_b_data}
          rosterA={rosterA} rosterB={rosterB}
          inA={inA} inB={inB} setInA={setInA} setInB={setInB}
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
                    ΛΕΠΤΟ{minute ? ` → ${fmtMinute(period, minute)}` : ''}
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
                1–{PERIODS.find(P => P.id === period)!.cap} κανονικό ·
                πάνω από {PERIODS.find(P => P.id === period)!.cap} = καθυστερήσεις
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
          teamName={side === 'a' ? match.team_a_data?.name : match.team_b_data?.name}
          minuteLabel={period === 'PEN' ? '' : (minute ? fmtMinute(period, minute) : '')}
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
function SquadPicker({
  teamA, teamB, rosterA, rosterB, inA, inB, setInA, setInB, onSave, saving,
}: any) {
  const [tab, setTab] = useState<Side>('a')
  const roster = tab === 'a' ? rosterA : rosterB
  const set    = tab === 'a' ? inA : inB
  const setSet = tab === 'a' ? setInA : setInB

  const toggle = (id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setSet(next)
  }

  const total = inA.size + inB.size

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3.5 pt-4 pb-3">
        <h2 className="text-base font-bold text-chalk tracking-tight">Συμμετοχές</h2>
        <p className="text-xs text-dim mt-0.5">
          Πάτα παίκτη για να τον βγάλεις εκτός
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
      </div>

      <div className="flex-1 overflow-y-auto px-3.5">
        <div className="flex flex-col gap-1">
          {roster.map((p: Player) => {
            const on = set.has(p.player_id)
            return (
              <button key={p.player_id} onClick={() => toggle(p.player_id)}
                className={`w-full rounded-xl px-3.5 py-3 flex items-center gap-3
                  transition-colors border
                  ${on ? 'bg-lit/[0.07] border-lit/[0.28]'
                       : 'bg-turf border-transparent'}`}>
                <span className={`w-[3px] h-6 rounded-sm shrink-0
                  ${on ? 'bg-lit' : 'bg-off'}`} />
                <span className="w-6 text-[12.5px] font-extrabold text-dim
                  text-center shrink-0 tnum">
                  {p.number ?? '—'}
                </span>
                <Avatar url={p.photo_url} name={p.full_name} size={28} />
                <span className={`flex-1 text-left text-[14.5px] font-semibold truncate
                  ${on ? 'text-chalk' : 'text-chalk/[0.28]'}`}>
                  {p.full_name}
                </span>
                <span className="text-[9px] font-bold text-dim tracking-[0.06em] shrink-0">
                  {on ? 'ΣΥΜΜΕΤΟΧΗ' : 'ΕΚΤΟΣ'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-3.5">
        <button onClick={onSave} disabled={!total || saving}
          className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
            text-white font-extrabold text-[15px] disabled:opacity-25
            shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
          {saving ? 'Αποθήκευση…' : 'Έναρξη αγώνα'}
        </button>
      </div>
    </div>
  )
}

/* ── Επιλογή παίκτη ── */
function PlayerSheet({
  type, players, teamName, minuteLabel, chained, onPick, onSkip, onClose,
}: {
  type: EventType; players: Player[]; teamName?: string
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
                <span className="text-[14.5px] font-semibold text-chalk truncate">
                  {p.full_name}
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

'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'
import { useAuth } from '@/lib/hooks/useAuth'
import { Watermark, Crest, Avatar, LiveDot, SectionLabel, Loading, Empty } from '@/app/ui'
import { PERIODS, EVENTS, fmtMinute, absMinute } from '@/lib/match'
import type { Period } from '@/lib/types'

export default function PublicMatch() {
  const { matchId } = useParams()
  const router = useRouter()
  const { isSpeaker } = useAuth()
  const { match, events, loading } = useLiveMatch(matchId as string)
  const supabase = createClient()

  // Συνθέσεις: φέρνουμε τα στοιχεία των παικτών από τα squad_a/squad_b
  const [squad, setSquad] = useState<any[]>([])
  const squadKey = [...(match?.squad_a ?? []), ...(match?.squad_b ?? [])].join(',')
  useEffect(() => {
    const ids = squadKey ? squadKey.split(',') : []
    if (!ids.length) { setSquad([]); return }
    supabase.from('players')
      .select('player_id, full_name, number, photo_url, team_id')
      .in('player_id', ids)
      .then(({ data }) => setSquad(data ?? []))
  }, [squadKey])

  if (loading) return <Loading />
  if (!match) return <div className="min-h-screen bg-pitch" />

  const live = match.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(match.match_status)
  const hasPens = match.pens_team_a > 0 || match.pens_team_b > 0
  const place = [match.venue?.name, match.field].filter(Boolean).join(' · ')

  // Γκολ ανά παίκτη (για σήμανση στη σύνθεση)
  const goalsBy = new Map<string, number>()
  for (const e of events) {
    if (e.event_type === 'GOAL' && e.period !== 'PEN' && e.player_id) {
      goalsBy.set(e.player_id, (goalsBy.get(e.player_id) ?? 0) + 1)
    }
  }
  const squadA = squad.filter(p => p.team_id === match.team_a)
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
  const squadB = squad.filter(p => p.team_id === match.team_b)
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
  const hasSquads = squadA.length > 0 || squadB.length > 0

  return (
    <div className="min-h-screen bg-pitch pb-8">
      {/* Πίνακας σκορ */}
      <div className="relative bg-turf border-b-2 border-brand overflow-hidden">
        <Watermark opacity={0.05} />
        <div className="relative px-3.5 pt-3.5 pb-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => router.back()}
              className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center
                text-silver text-base">
              ‹
            </button>
            <span className="text-[9.5px] text-dim font-bold">
              {match.league?.name} · Αγ. {match.round}
            </span>
            <div className="w-[30px]" />
          </div>

          <div className="flex items-start gap-2.5">
            <Side team={match.team_a_data} />
            <div className="shrink-0 text-center pt-1.5">
              <div className="text-[40px] font-extrabold text-chalk leading-none
                tracking-tight tnum">
                {match.goals_team_a}
                <span className="text-dim mx-1.5 font-normal">·</span>
                {match.goals_team_b}
              </div>
              {hasPens && (
                <div className="text-[11px] font-extrabold text-lit mt-1.5 tnum">
                  πέν. {match.pens_team_a}–{match.pens_team_b}
                </div>
              )}
              <div className="mt-2">
                {live ? <LiveDot /> : (
                  <span className="text-[9px] font-extrabold text-dim tracking-[0.14em]">
                    {done ? 'ΤΕΛΙΚΟ' : 'ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟΣ'}
                  </span>
                )}
              </div>
            </div>
            <Side team={match.team_b_data} />
          </div>

          {place && (
            <p className="text-[9.5px] text-off text-center mt-4">{place}</p>
          )}
        </div>
      </div>

      {/* Γραφικό αποτελέσματος για Instagram */}
      {(live || done) && (
        <div className="px-3.5 pt-3.5">
          <a href={`/api/og/match/${matchId}`} target="_blank" rel="noopener"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
              bg-turf border border-lit/25 text-lit text-[12.5px] font-extrabold
              active:bg-[#1C1C22]">
            📸 Γραφικό αποτελέσματος για Instagram
          </a>
        </div>
      )}

      {/* Κουμπί speaker */}
      {isSpeaker && (
        <div className="px-3.5 pt-3.5">
          <Link href={`/speaker/${matchId}`}
            className="block w-full py-3 rounded-xl bg-gradient-to-b from-lit to-brand
              text-white font-extrabold text-sm text-center
              shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
            Άνοιγμα panel speaker
          </Link>
        </div>
      )}

      {/* Περιγραφή */}
      <div className="px-3.5 pt-4">
        <SectionLabel>Περιγραφή</SectionLabel>

        {!events.length ? (
          <Empty>Δεν υπάρχουν φάσεις ακόμα.</Empty>
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
                      const cfg  = EVENTS[e.event_type as keyof typeof EVENTS]
                      const home = e.team_id === match.team_a
                      return (
                        <Link key={e.event_id}
                          href={e.player?.player_id ? `/player/${e.player.player_id}` : '#'}
                          className="bg-turf rounded-lg px-3 py-2.5 flex items-center gap-3
                            border border-chalk/[0.04] active:bg-[#1C1C22]"
                          style={{ borderLeft: `3px solid ${home ? '#E05B1F' : '#63636E'}` }}>
                          <span className="text-xs font-extrabold text-silver w-9 shrink-0 tnum">
                            {fmtMinute(e.period as Period, e.minute)}
                          </span>
                          <span className="text-base shrink-0">{cfg?.icon}</span>
                          <Avatar url={e.player?.photo_url} name={e.player?.full_name} size={24} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-semibold text-chalk truncate">
                              {e.player?.full_name}
                            </p>
                            <p className="text-[10px] text-dim">
                              {cfg?.label} · {home ? match.team_a_data?.name : match.team_b_data?.name}
                            </p>
                          </div>
                          <span className="text-dim text-xs shrink-0">›</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Συνθέσεις */}
      {hasSquads && (
        <div className="px-3.5 pt-6">
          <SectionLabel>Συνθέσεις</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <SquadCol
              team={match.team_a_data}
              players={squadA}
              goalsBy={goalsBy}
              align="left"
            />
            <SquadCol
              team={match.team_b_data}
              players={squadB}
              goalsBy={goalsBy}
              align="right"
            />
          </div>
        </div>
      )}

      {/* MVP */}
      {match.mvp && (
        <div className="px-3.5 pt-6">
          <SectionLabel>MVP αγώνα</SectionLabel>
          <div className="bg-gradient-to-r from-lit/[0.14] to-turf rounded-xl p-3.5
            border border-lit/25 flex items-center gap-3">
            <span className="text-2xl">⭐</span>
            <Avatar url={match.mvp.photo_url} name={match.mvp.full_name} size={44} ring />
            <div className="flex-1 min-w-0">
              <p className="text-[8.5px] font-extrabold text-lit tracking-[0.14em]">
                ΠΟΛΥΤΙΜΟΤΕΡΟΣ ΠΑΙΚΤΗΣ
              </p>
              <p className="text-[15px] font-extrabold text-chalk truncate">
                {match.mvp.full_name}
              </p>
              <p className="text-[10.5px] text-dim">
                {match.mvp.team_id === match.team_a
                  ? match.team_a_data?.name : match.team_b_data?.name}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Κείμενο αγώνα */}
      {match.report && (
        <div className="px-3.5 pt-6">
          <SectionLabel>Ρεπορτάζ</SectionLabel>
          <div className="bg-turf rounded-xl p-4 border border-chalk/[0.05]">
            <p className="text-[13.5px] text-chalk leading-relaxed whitespace-pre-wrap">
              {match.report}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function SquadCol({ team, players, goalsBy, align }: {
  team: any; players: any[]; goalsBy: Map<string, number>; align: 'left' | 'right'
}) {
  return (
    <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-chalk/[0.06]
        ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <Crest url={team?.logo_url} name={team?.name} size={20} />
        <span className="text-[11px] font-extrabold text-chalk truncate flex-1">{team?.name}</span>
      </div>
      {!players.length ? (
        <p className="text-[10px] text-off text-center py-4">—</p>
      ) : (
        <div className="flex flex-col">
          {players.map((p, i) => {
            const g = goalsBy.get(p.player_id) ?? 0
            return (
              <Link key={p.player_id} href={`/player/${p.player_id}`}
                className={`flex items-center gap-2 px-2.5 py-2 active:bg-[#1C1C22]
                  ${i ? 'border-t border-chalk/[0.04]' : ''}
                  ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
                <span className="w-4 text-[10px] font-extrabold text-dim tnum shrink-0 text-center">
                  {p.number ?? '–'}
                </span>
                <Avatar url={p.photo_url} name={p.full_name} size={22} />
                <span className="flex-1 min-w-0 text-[11.5px] font-semibold text-chalk truncate">
                  {p.full_name}
                </span>
                {g > 0 && (
                  <span className="text-[10px] shrink-0">
                    ⚽{g > 1 ? g : ''}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Side({ team }: { team: any }) {
  const inner = (
    <>
      <Crest url={team?.logo_url} name={team?.name} size={52} />
      <span className="text-xs font-bold text-chalk text-center leading-tight">
        {team?.name}
      </span>
    </>
  )
  if (!team?.team_id) {
    return <div className="flex-1 min-w-0 flex flex-col items-center gap-2">{inner}</div>
  }
  return (
    <Link href={`/team/${team.team_id}`}
      className="flex-1 min-w-0 flex flex-col items-center gap-2 active:opacity-70">
      {inner}
    </Link>
  )
}

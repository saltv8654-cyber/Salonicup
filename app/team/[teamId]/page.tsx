import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Crest, Avatar, BottomNav, Empty, SectionLabel, LiveDot } from '@/app/ui'
import { fmtDateTime } from '@/lib/time'
import type { PlayerStat, Standing } from '@/lib/types'

export const revalidate = 30

const GRID = 'grid items-center gap-0 [grid-template-columns:22px_30px_1fr_32px_28px_28px_24px_24px]'

export default async function TeamPage({
  params, searchParams,
}: { params: { teamId: string }; searchParams: { tab?: string } }) {
  const supabase = createClient()
  const tab = searchParams.tab === 'matches' ? 'matches' : 'players'

  const { data: team } = await supabase
    .from('teams')
    .select('*, league:league_id(league_id, name)')
    .eq('team_id', params.teamId)
    .single()

  if (!team) notFound()

  const [{ data: standing }, { data: squad }, { data: matches }] = await Promise.all([
    supabase.from('standings').select('*').eq('team_id', params.teamId).single(),
    supabase.from('player_stats').select('*')
      .eq('team_id', params.teamId).order('number', { nullsFirst: false }),
    supabase.from('matches')
      .select('*, team_a_data:team_a(name,logo_url), team_b_data:team_b(name,logo_url), venue:venue_id(name)')
      .or(`team_a.eq.${params.teamId},team_b.eq.${params.teamId}`)
      .order('round', { ascending: true }),
  ])

  const s = standing as Standing | null
  const played = (matches ?? []).filter((m: any) => ['Played', 'Forfeit', 'Live'].includes(m.match_status))
  const upcoming = (matches ?? []).filter((m: any) => m.match_status === 'Scheduled')

  // Φόρμα: τελευταία 5 ολοκληρωμένα, πιο πρόσφατο τελευταίο
  const form: ('W' | 'D' | 'L')[] = (matches ?? [])
    .filter((m: any) => ['Played', 'Forfeit'].includes(m.match_status))
    .slice(-5)
    .map((m: any) => {
      const us = m.team_a === params.teamId
      const gf = us ? m.goals_team_a : m.goals_team_b
      const ga = us ? m.goals_team_b : m.goals_team_a
      return gf > ga ? 'W' : gf < ga ? 'L' : 'D'
    })

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2.5">
        <Link href={`/?league=${team.league?.league_id}`}
          className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center
            text-silver text-base">‹</Link>
        <span className="text-[10.5px] text-dim font-bold">{team.league?.name}</span>
      </div>

      <div className="relative bg-turf px-4 py-5 border-b-2 border-brand overflow-hidden">
        <Watermark />
        <div className="relative flex items-center gap-3.5">
          <Crest url={team.logo_url} name={team.name} size={56} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-chalk tracking-tight">{team.name}</h1>
            {s && (
              <div className="flex gap-3.5 mt-2">
                <Stat v={s.position} l="ΘΕΣΗ" />
                <Stat v={s.points} l="ΒΑΘΜΟΙ" hi />
                <Stat v={`${s.wins}·${s.draws}·${s.losses}`} l="Ν·Ι·Η" />
                <Stat v={s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff} l="ΔΙΑΦ." />
              </div>
            )}
            {form.length > 0 && (
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[7.5px] text-dim font-bold tracking-[0.08em] mr-0.5">ΦΟΡΜΑ</span>
                {form.map((r, i) => (
                  <span key={i}
                    className={`w-5 h-5 rounded grid place-items-center text-[10px] font-black text-white
                      ${r === 'W' ? 'bg-[#2FA84F]' : r === 'L' ? 'bg-[#D8483C]' : 'bg-[#6B6B75]'}`}>
                    {r === 'W' ? 'Ν' : r === 'L' ? 'Η' : 'Ι'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Καρτέλες */}
      <div className="flex gap-1.5 px-3.5 pt-3.5">
        <TabLink teamId={params.teamId} tab="players" active={tab === 'players'}>Παίκτες</TabLink>
        <TabLink teamId={params.teamId} tab="matches" active={tab === 'matches'}>Αγωνιστικές</TabLink>
      </div>

      <div className="px-3.5 py-4">
        {tab === 'players' ? (
          !squad?.length ? <Empty>Δεν υπάρχουν παίκτες.</Empty> : (
            <>
              <div className={`${GRID} px-3 pb-2 text-[8px] font-extrabold
                text-dim tracking-[0.08em]`}>
                <span /><span />
                <span className="pl-0.5">ΠΑΙΚΤΗΣ</span>
                <span className="text-center">ΣΥΜ</span>
                <span className="text-center">ΓΚΛ</span>
                <span className="text-center">ΑΣΤ</span>
                <span className="text-center">🟨</span>
                <span className="text-center">🟥</span>
              </div>
              <div className="flex flex-col gap-[3px]">
                {squad.map((p: PlayerStat) => (
                  <Link key={p.player_id} href={`/player/${p.player_id}`}
                    className={`${GRID} bg-turf rounded-lg px-3 py-2
                      border border-chalk/[0.04] active:bg-[#1C1C22]`}>
                    <span className="text-xs font-extrabold text-dim tnum">{p.number ?? '—'}</span>
                    <span className="grid place-items-center">
                      <Avatar url={p.photo_url} name={p.full_name} size={26} />
                    </span>
                    <span className="text-[13px] font-semibold text-chalk truncate pl-0.5">
                      {p.full_name}
                    </span>
                    <Cell v={p.appearances} c="text-dim" />
                    <Cell v={p.goals} c={p.goals ? 'text-lit font-extrabold' : 'text-off'} />
                    <Cell v={p.assists} c={p.assists ? 'text-chalk' : 'text-off'} />
                    <Cell v={p.yellow_cards || ''} c="text-card" />
                    <Cell v={p.red_cards || ''} c="text-danger" />
                  </Link>
                ))}
              </div>
            </>
          )
        ) : (
          !matches?.length ? <Empty>Δεν υπάρχουν αγώνες.</Empty> : (
            <div className="flex flex-col gap-4">
              {played.length > 0 && (
                <div>
                  <SectionLabel>Αποτελέσματα</SectionLabel>
                  <div className="flex flex-col gap-1.5">
                    {played.map((m: any) => <MatchRow key={m.match_id} m={m} teamId={params.teamId} />)}
                  </div>
                </div>
              )}
              {upcoming.length > 0 && (
                <div>
                  <SectionLabel>Υπολείπονται</SectionLabel>
                  <div className="flex flex-col gap-1.5">
                    {upcoming.map((m: any) => <MatchRow key={m.match_id} m={m} teamId={params.teamId} />)}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      <BottomNav />
    </div>
  )
}

function TabLink({ teamId, tab, active, children }: {
  teamId: string; tab: string; active: boolean; children: React.ReactNode
}) {
  return (
    <Link href={`/team/${teamId}?tab=${tab}`}
      className={`flex-1 text-center py-2.5 rounded-xl text-[12.5px] font-bold border
        ${active ? 'bg-brand text-chalk border-lit' : 'bg-turf text-dim border-chalk/[0.06]'}`}>
      {children}
    </Link>
  )
}

function MatchRow({ m, teamId }: { m: any; teamId: string }) {
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)
  const homeUs = m.team_a === teamId
  return (
    <Link href={`/match/${m.match_id}`}
      className={`block bg-turf rounded-lg px-3.5 py-3 border active:bg-[#1C1C22]
        ${live ? 'border-live/35' : 'border-chalk/[0.04]'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9.5px] text-dim font-bold">
          Αγ. {m.round}{m.match_date ? ` · ${fmtDateTime(m.match_date)}` : ''}
        </span>
        {live && <LiveDot />}
      </div>
      <div className="grid items-center gap-2 [grid-template-columns:1fr_50px_1fr]">
        <div className="flex items-center gap-2 min-w-0">
          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={22} />
          <span className={`text-[13px] truncate ${homeUs ? 'font-extrabold text-chalk' : 'font-semibold text-silver'}`}>
            {m.team_a_data?.name}
          </span>
        </div>
        <div className="text-center">
          {live || done ? (
            <span className="text-lg font-extrabold text-chalk tnum">
              {m.goals_team_a}<span className="text-off mx-1">·</span>{m.goals_team_b}
            </span>
          ) : <span className="text-[11px] font-extrabold text-off">VS</span>}
        </div>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className={`text-[13px] truncate text-right ${!homeUs ? 'font-extrabold text-chalk' : 'font-semibold text-silver'}`}>
            {m.team_b_data?.name}
          </span>
          <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={22} />
        </div>
      </div>
    </Link>
  )
}

function Stat({ v, l, hi }: { v: React.ReactNode; l: string; hi?: boolean }) {
  return (
    <div>
      <div className={`text-sm font-extrabold leading-none tnum
        ${hi ? 'text-lit' : 'text-chalk'}`}>{v}</div>
      <div className="text-[7.5px] text-dim font-bold mt-[3px] tracking-[0.08em]">{l}</div>
    </div>
  )
}

function Cell({ v, c }: { v: React.ReactNode; c: string }) {
  return <span className={`text-center text-[12.5px] font-bold tnum ${c}`}>{v}</span>
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Crest, Avatar, BottomNav, Empty, FieldBadge } from '@/app/ui'
import { fmtDay, fmtTime } from '@/lib/time'
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

  // Ζευγάρωμα ανά αντίπαλο: Α' γύρος (πρώτη συνάντηση) | Β' γύρος (δεύτερη)
  const oppMap = new Map<string, { oppName: string; oppLogo: string | null; legs: any[] }>()
  for (const m of matches ?? []) {
    const us = m.team_a === params.teamId
    const oppId = us ? m.team_b : m.team_a
    const oppData = us ? m.team_b_data : m.team_a_data
    if (!oppMap.has(oppId)) oppMap.set(oppId, {
      oppName: oppData?.name ?? '—', oppLogo: oppData?.logo_url ?? null, legs: [],
    })
    oppMap.get(oppId)!.legs.push(m)
  }
  const fixtureRows = [...oppMap.values()]
    .map(r => {
      const legs = r.legs.slice().sort((a: any, b: any) => (a.round ?? 0) - (b.round ?? 0))
      return { ...r, leg1: legs[0] ?? null, leg2: legs[1] ?? null,
        firstRound: legs[0]?.round ?? 999 }
    })
    .sort((a, b) => a.firstRound - b.firstRound)

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
          !fixtureRows.length ? <Empty>Δεν υπάρχουν αγώνες.</Empty> : (
            <div>
              {/* Κεφαλίδα στηλών */}
              <div className="grid items-center gap-2 px-1 pb-2
                [grid-template-columns:1fr_92px_1fr]">
                <span className="text-[8.5px] font-extrabold text-dim tracking-[0.1em] text-center">
                  Α΄ ΓΥΡΟΣ
                </span>
                <span />
                <span className="text-[8.5px] font-extrabold text-dim tracking-[0.1em] text-center">
                  Β΄ ΓΥΡΟΣ
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {fixtureRows.map((r, i) => (
                  <div key={i} className="grid items-center gap-2
                    [grid-template-columns:1fr_92px_1fr]">
                    <LegCell m={r.leg1} teamId={params.teamId} />
                    <div className="flex flex-col items-center gap-1 min-w-0">
                      <Crest url={r.oppLogo} name={r.oppName} size={26} />
                      <span className="text-[10px] font-semibold text-silver text-center
                        leading-tight truncate max-w-[90px]">{r.oppName}</span>
                    </div>
                    <LegCell m={r.leg2} teamId={params.teamId} />
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>

      <BottomNav />
    </div>
  )
}

function LegCell({ m, teamId }: { m: any; teamId: string }) {
  if (!m) {
    return (
      <div className="rounded-lg bg-chalk/[0.02] border border-dashed border-chalk/[0.06]
        px-2 py-2.5 grid place-items-center min-h-[52px]">
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
    <Link href={`/match/${m.match_id}`}
      className={`block rounded-lg bg-turf border px-2 py-2 text-center active:bg-[#1C1C22]
        min-h-[52px] flex flex-col justify-center
        ${live ? 'border-live/35' : 'border-chalk/[0.05]'}`}>
      <div className="text-[7.5px] font-extrabold text-off tracking-[0.06em] mb-0.5">
        Αγ.{m.round}
      </div>
      {live || done ? (
        <div className={`text-[16px] font-extrabold tnum leading-none ${resColor}`}>
          {gf}<span className="text-dim mx-0.5">-</span>{ga}
        </div>
      ) : m.match_date ? (
        <div className="leading-tight">
          <div className="text-[10.5px] font-bold text-silver">{fmtDay(m.match_date)}</div>
          <div className="text-[10px] text-dim tnum">{fmtTime(m.match_date)}</div>
        </div>
      ) : (
        <div className="text-[11px] font-extrabold text-off">VS</div>
      )}
      {m.field && (
        <div className="flex justify-center mt-1.5">
          <FieldBadge field={m.field} size="xs" />
        </div>
      )}
    </Link>
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

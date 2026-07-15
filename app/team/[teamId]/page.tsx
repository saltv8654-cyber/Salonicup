import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Crest, Avatar, Postponements, BottomNav, Empty } from '@/app/ui'
import type { PlayerStat, Standing } from '@/lib/types'

export const revalidate = 30

const GRID = 'grid items-center gap-0 [grid-template-columns:22px_30px_1fr_32px_28px_28px_24px_24px]'

export default async function TeamPage({ params }: { params: { teamId: string } }) {
  const supabase = createClient()

  const { data: team } = await supabase
    .from('teams')
    .select('*, league:league_id(league_id, name)')
    .eq('team_id', params.teamId)
    .single()

  if (!team) notFound()

  const [{ data: standing }, { data: squad }] = await Promise.all([
    supabase.from('standings').select('*').eq('team_id', params.teamId).single(),
    supabase.from('player_stats').select('*')
      .eq('team_id', params.teamId).order('number', { nullsFirst: false }),
  ])

  const s = standing as Standing | null

  return (
    <div className="min-h-screen bg-pitch pb-20">
      {/* Πίσω */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2.5">
        <Link href={`/?league=${team.league?.league_id}`}
          className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center
            text-silver text-base">
          ‹
        </Link>
        <span className="text-[10.5px] text-dim font-bold">{team.league?.name}</span>
      </div>

      {/* Ήρωας */}
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
                <div>
                  <div className="mb-[3px]"><Postponements n={team.postponements} /></div>
                  <div className="text-[7.5px] text-dim font-bold tracking-[0.08em]">
                    ΑΝΑΒΟΛΕΣ
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-3.5 py-4">
        {!squad?.length ? <Empty>Δεν υπάρχουν παίκτες.</Empty> : (
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
                  <span className="text-xs font-extrabold text-dim tnum">
                    {p.number ?? '—'}
                  </span>
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
        )}
      </div>

      <BottomNav />
    </div>
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

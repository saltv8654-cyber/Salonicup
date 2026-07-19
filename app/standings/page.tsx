import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Crest, Postponements, BottomNav, Empty } from '../ui'
import GraphicLink from '../graphic-link'
import type { League, Standing } from '@/lib/types'

export const revalidate = 30

const GRID = 'grid items-center gap-0 [grid-template-columns:18px_24px_1fr_24px_24px_24px_24px_30px_34px_32px]'

export default async function StandingsPage({
  searchParams,
}: { searchParams: { league?: string } }) {
  const supabase = createClient()

  const { data: leagues } = await supabase
    .from('leagues').select('*').eq('active', true).order('sort_order')

  const active: League | undefined =
    leagues?.find(l => l.league_id === searchParams.league) ?? leagues?.[0]

  const { data: rows } = active
    ? await supabase.from('standings').select('*')
        .eq('league_id', active.league_id).order('position')
    : { data: [] as Standing[] }

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <header className="relative px-4 pt-6 pb-4 overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-36">
          <Watermark opacity={0.05} />
        </div>
        <div className="relative">
          <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
            Salonicup
          </p>
          <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">
            Βαθμολογία
          </h1>
        </div>
      </header>

      {/* Πρωταθλήματα */}
      <div className="flex gap-2 px-3.5 pb-4 overflow-x-auto">
        {leagues?.map(l => {
          const on = active?.league_id === l.league_id
          return (
            <Link key={l.league_id} href={`/standings?league=${l.league_id}`}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full
                text-[11.5px] font-bold whitespace-nowrap border transition-colors
                ${on ? 'bg-brand text-chalk border-lit'
                     : 'bg-turf text-dim border-chalk/[0.06]'}`}>
              {l.logo_url && <img src={l.logo_url} alt="" className="w-4 h-4 object-contain" />}
              {l.name}
            </Link>
          )
        })}
      </div>

      <div className="px-3.5 pb-6">
        {!active ? <Empty>Δεν υπάρχουν πρωταθλήματα.</Empty> : (
          <>
            {/* Κεφαλίδα πρωταθλήματος */}
            <div className="relative bg-turf rounded-xl p-4 mb-4 overflow-hidden
              border border-lit/20">
              <Watermark opacity={0.06} />
              <div className="relative flex items-center gap-3">
                {active.logo_url
                  ? <img src={active.logo_url} alt="" className="w-8 h-8 object-contain" />
                  : <span className="text-3xl">🏆</span>}
                <div>
                  <p className="text-[8.5px] text-lit font-extrabold tracking-[0.16em]">
                    SEASON {active.season}
                  </p>
                  <h2 className="text-lg font-extrabold text-chalk mt-0.5 tracking-tight">
                    {active.name}
                  </h2>
                </div>
              </div>
            </div>

            {/* Γραφικό για Instagram — μόνο speaker/admin */}
            <GraphicLink href={`/api/og/standings/${active.league_id}`}>
              📸 Γραφικό βαθμολογίας για Instagram
            </GraphicLink>

            {!rows?.length ? <Empty /> : (
              <>
                {/* Κεφαλίδα πίνακα */}
                <div className={`${GRID} px-3 pb-2 text-[8px] font-extrabold
                  text-dim tracking-[0.08em]`}>
                  <span>#</span>
                  <span />
                  <span className="pl-1">ΟΜΑΔΑ</span>
                  <span className="text-center">Α</span>
                  <span className="text-center">Ν</span>
                  <span className="text-center">Ι</span>
                  <span className="text-center">Η</span>
                  <span className="text-center">ΔΓ</span>
                  <span className="text-center text-lit">ΒΑΘ</span>
                  <span className="text-center">ΑΝΒ</span>
                </div>

                <div className="flex flex-col gap-[3px]">
                  {rows.map((t: Standing, i: number) => (
                    <Link key={t.team_id} href={`/team/${t.team_id}`}
                      className={`${GRID} bg-turf rounded-lg px-3 py-2.5
                        border border-chalk/[0.04] active:bg-[#1C1C22]
                        ${i === 0 ? 'bg-gradient-to-r from-lit/[0.14] to-turf border-lit/30' : ''}`}>
                      <span className={`text-xs font-extrabold tnum
                        ${i === 0 ? 'text-lit' : i < 3 ? 'text-silver' : 'text-dim'}`}>
                        {t.position}
                      </span>
                      <span className="grid place-items-center">
                        <Crest url={t.logo_url} name={t.team_name} size={20} />
                      </span>
                      <span className="text-[13px] font-semibold text-chalk truncate pl-1">
                        {t.team_name}
                      </span>
                      <span className="text-center text-[12.5px] font-bold text-dim tnum">{t.played}</span>
                      <span className="text-center text-[12.5px] font-bold text-silver tnum">{t.wins}</span>
                      <span className="text-center text-[12.5px] font-bold text-dim tnum">{t.draws}</span>
                      <span className="text-center text-[12.5px] font-bold text-dim tnum">{t.losses}</span>
                      <span className={`text-center text-[12.5px] font-bold tnum
                        ${t.goal_diff > 0 ? 'text-lit' : t.goal_diff < 0 ? 'text-[#9E5148]' : 'text-dim'}`}>
                        {t.goal_diff > 0 ? `+${t.goal_diff}` : t.goal_diff}
                      </span>
                      <span className="text-center text-sm font-extrabold text-chalk tnum">
                        {t.points}
                      </span>
                      <span className="grid place-items-center">
                        <Postponements n={t.postponements} />
                      </span>
                    </Link>
                  ))}
                </div>

                {/* Υπόμνημα */}
                <div className="flex items-center justify-center gap-3 mt-3.5 flex-wrap">
                  <span className="text-[9px] text-off font-bold">ΑΝΒ = αναβολές</span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-sm bg-card" />
                    <span className="text-[9px] text-off">1/2</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-sm bg-danger" />
                    <span className="text-[9px] text-off">2/2 — τελευταία</span>
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

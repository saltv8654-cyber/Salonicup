import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Avatar, Crest, BottomNav, Empty, SectionLabel } from '@/app/ui'
import type { League, PlayerStat } from '@/lib/types'

export const revalidate = 30

export default async function StatsPage({
  searchParams,
}: { searchParams: { league?: string } }) {
  const supabase = createClient()

  const { data: leagues } = await supabase
    .from('leagues').select('*').eq('active', true).order('sort_order')

  const active: League | undefined =
    leagues?.find(l => l.league_id === searchParams.league) ?? leagues?.[0]

  const { data: stats } = active
    ? await supabase.from('player_stats').select('*').eq('league_id', active.league_id)
    : { data: [] as PlayerStat[] }

  const rows = (stats ?? []) as PlayerStat[]
  const top = (key: (p: PlayerStat) => number) =>
    rows.filter(p => key(p) > 0)
      .sort((a, b) => key(b) - key(a) || b.goals - a.goals)
      .slice(0, 12)

  const scorers = top(p => p.goals)
  const assists = top(p => p.assists)
  const cards   = top(p => p.yellow_cards + p.red_cards * 2)

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <header className="relative px-4 pt-6 pb-4 overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-36">
          <Watermark opacity={0.05} />
        </div>
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
          Salonicup
        </p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Στατιστικά</h1>
      </header>

      <div className="flex gap-2 px-3.5 pb-4 overflow-x-auto">
        {leagues?.map(l => {
          const on = active?.league_id === l.league_id
          return (
            <Link key={l.league_id} href={`/stats?league=${l.league_id}`}
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

      <div className="px-3.5 flex flex-col gap-6">
        {!active ? <Empty>Δεν υπάρχουν πρωταθλήματα.</Empty> : (
          <>
            <StatList title="⚽ Σκόρερ"  rows={scorers} value={p => p.goals} />
            <StatList title="🅰️ Ασίστ"   rows={assists} value={p => p.assists} />
            <StatList title="🟨 Κάρτες"  rows={cards}
              value={p => p.yellow_cards + p.red_cards}
              extra={p => p.red_cards > 0 ? `${p.yellow_cards}🟨 ${p.red_cards}🟥` : `${p.yellow_cards}🟨`} />
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

function StatList({ title, rows, value, extra }: {
  title: string; rows: PlayerStat[]
  value: (p: PlayerStat) => number
  extra?: (p: PlayerStat) => string
}) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {!rows.length ? <Empty>—</Empty> : (
        <div className="flex flex-col gap-1">
          {rows.map((p, i) => (
            <Link key={p.player_id} href={`/player/${p.player_id}`}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border
                ${i === 0 ? 'bg-gradient-to-r from-lit/[0.14] to-turf border-lit/30'
                          : 'bg-turf border-chalk/[0.04]'}`}>
              <span className={`w-5 text-center text-xs font-extrabold tnum shrink-0
                ${i === 0 ? 'text-lit' : i < 3 ? 'text-silver' : 'text-dim'}`}>
                {i + 1}
              </span>
              <Avatar url={p.photo_url} name={p.full_name} size={30} ring={i === 0} />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-chalk truncate">{p.full_name}</p>
                <p className="text-[10px] text-dim truncate">{p.team_name}</p>
              </div>
              {extra && (
                <span className="text-[10px] text-dim shrink-0">{extra(p)}</span>
              )}
              <span className="text-lg font-extrabold text-chalk tnum shrink-0 w-8 text-right">
                {value(p)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

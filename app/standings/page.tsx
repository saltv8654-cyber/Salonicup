import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Crest, Postponements, BottomNav, Empty, LiveDot, FieldBadge, Avatar, SectionLabel } from '../ui'
import GraphicLink from '../graphic-link'
import { fmtDay, fmtTime } from '@/lib/time'
import type { League, Standing, PlayerStat } from '@/lib/types'

export const revalidate = 30

const GRID = 'grid items-center gap-0 [grid-template-columns:18px_24px_1fr_24px_24px_24px_24px_30px_34px_32px]'

export default async function StandingsPage({
  searchParams,
}: { searchParams: { league?: string; view?: string } }) {
  const supabase = createClient()
  const view = searchParams.view === 'fixtures' ? 'fixtures'
    : searchParams.view === 'scorers' ? 'scorers' : 'table'

  const { data: leagues } = await supabase
    .from('leagues').select('*').eq('active', true).order('sort_order')

  const active: League | undefined =
    leagues?.find(l => l.league_id === searchParams.league) ?? leagues?.[0]

  const { data: rows } = active
    ? await supabase.from('standings').select('*')
        .eq('league_id', active.league_id).order('position')
    : { data: [] as Standing[] }

  // Αγωνιστικές (μόνο στην αντίστοιχη καρτέλα)
  const { data: fixtures } = active && view === 'fixtures'
    ? await supabase.from('matches')
        .select(`*, team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url)`)
        .eq('league_id', active.league_id)
        .order('round', { ascending: true })
        .order('match_date', { ascending: true })
    : { data: [] as any[] }

  const byRound = new Map<number, any[]>()
  for (const m of fixtures ?? []) {
    if (!byRound.has(m.round)) byRound.set(m.round, [])
    byRound.get(m.round)!.push(m)
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b)

  // Σκόρερ (μόνο στην αντίστοιχη καρτέλα)
  const { data: stats } = active && view === 'scorers'
    ? await supabase.from('player_stats').select('*').eq('league_id', active.league_id)
    : { data: [] as PlayerStat[] }
  const srows = (stats ?? []) as PlayerStat[]
  const top = (key: (p: PlayerStat) => number) =>
    srows.filter(p => key(p) > 0).sort((a, b) => key(b) - key(a) || b.goals - a.goals).slice(0, 12)
  const scorers = top(p => p.goals)
  const assists = top(p => p.assists)
  const cards = top(p => p.yellow_cards + p.red_cards * 2)

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

            {/* Καρτέλες: Βαθμολογία | Αγωνιστικές | Σκόρερ */}
            <div className="flex gap-1.5 mb-4">
              {([
                ['table', 'Βαθμολογία'], ['fixtures', 'Αγωνιστικές'], ['scorers', 'Σκόρερ'],
              ] as const).map(([v, label]) => (
                <Link key={v} href={`/standings?league=${active.league_id}&view=${v}`}
                  className={`flex-1 text-center py-2.5 rounded-xl text-[12px] font-bold border
                    ${view === v ? 'bg-brand text-chalk border-lit' : 'bg-turf text-dim border-chalk/[0.06]'}`}>
                  {label}
                </Link>
              ))}
            </div>

            {view === 'scorers' ? (
              !srows.length ? <Empty>Δεν υπάρχουν στατιστικά.</Empty> : (
                <div className="flex flex-col gap-6">
                  <StatList title="⚽ Σκόρερ" rows={scorers} value={p => p.goals} />
                  <StatList title="🅰️ Ασίστ" rows={assists} value={p => p.assists} />
                  <StatList title="🟨 Κάρτες" rows={cards}
                    value={p => p.yellow_cards + p.red_cards}
                    extra={p => p.red_cards > 0 ? `${p.yellow_cards}🟨 ${p.red_cards}🟥` : `${p.yellow_cards}🟨`} />
                </div>
              )
            ) : view === 'fixtures' ? (
              !rounds.length ? <Empty>Δεν υπάρχουν αγωνιστικές.</Empty> : (
                <div className="flex flex-col gap-4">
                  {rounds.map(r => (
                    <div key={r}>
                      <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em]
                        text-dim mb-2 px-1">Αγωνιστική {r}</p>
                      <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                        {byRound.get(r)!.map((m, i) => (
                          <FixtureRow key={m.match_id} m={m} first={i === 0} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
            <>
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
              {extra && <span className="text-[10px] text-dim shrink-0">{extra(p)}</span>}
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

function FixtureRow({ m, first }: { m: any; first: boolean }) {
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)
  return (
    <Link href={`/match/${m.match_id}`}
      className={`block px-3 py-3 active:bg-[#1C1C22] ${first ? '' : 'border-t border-chalk/[0.05]'}`}>
      <div className="grid items-center gap-2 [grid-template-columns:1fr_54px_1fr]">
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-chalk truncate text-right">
            {m.team_a_data?.name}
          </span>
          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={22} />
        </div>
        <div className="flex flex-col items-center justify-center">
          {live || done ? (
            <span className="text-[15px] font-extrabold text-chalk tnum leading-none">
              {m.goals_team_a} - {m.goals_team_b}
            </span>
          ) : (
            <span className="text-[13px] font-extrabold text-silver tnum leading-none">
              {m.match_date ? fmtTime(m.match_date) : 'VS'}
            </span>
          )}
          {live
            ? <span className="mt-1"><LiveDot /></span>
            : done
            ? <span className="text-[8px] font-extrabold text-dim tracking-[0.1em] mt-1">ΤΕΛ</span>
            : null}
        </div>
        <div className="flex items-center justify-start gap-2 min-w-0">
          <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={22} />
          <span className="text-[13px] font-semibold text-chalk truncate">
            {m.team_b_data?.name}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-1.5">
        {m.match_date && (
          <span className="text-[9.5px] text-off">{fmtDay(m.match_date)}</span>
        )}
        {m.field && <FieldBadge field={m.field} size="xs" />}
      </div>
    </Link>
  )
}

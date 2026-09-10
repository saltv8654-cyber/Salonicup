import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FieldBadge, Empty } from '@/app/ui'
import { fmtTime, fmtDay, athensDateKey } from '@/lib/time'

export const dynamic = 'force-dynamic'

const since = () => new Date(Date.now() - 86400000).toISOString()

export default async function AdminProgram() {
  const supabase = createClient()
  const { data: matches } = await supabase.from('matches')
    .select(`match_id, match_date, field, match_status, goals_team_a, goals_team_b, placeholder_a, placeholder_b,
      league:league_id(name), team_a_data:team_a(name), team_b_data:team_b(name), venue:venue_id(name)`)
    .not('match_date', 'is', null)
    .gte('match_date', since())
    .order('match_date')

  const byDay = new Map<string, any[]>()
  for (const m of matches ?? []) {
    const k = athensDateKey(m.match_date)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(m)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, list]) => ({ key: k, label: fmtDay(list[0].match_date), list }))

  const nm = (m: any, s: 'a' | 'b') =>
    (s === 'a' ? m.team_a_data : m.team_b_data)?.name ?? (s === 'a' ? m.placeholder_a : m.placeholder_b) ?? '—'

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-3">Ημερολόγιο</h1>

      {!days.length ? <Empty>Δεν υπάρχει πρόγραμμα.</Empty> : (
        <div className="flex flex-col gap-4">
          {days.map(d => (
            <div key={d.key}>
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit mb-2 px-1">{d.label}</p>
              <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                {d.list.map((m: any, i: number) => {
                  const live = m.match_status === 'Live'
                  const done = ['Played', 'Forfeit'].includes(m.match_status)
                  return (
                    <Link key={m.match_id} href={`/match/${m.match_id}`}
                      className={`flex items-center gap-2.5 px-3 py-2.5 active:bg-[#1C1C22]
                        ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                      <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">
                        {fmtTime(m.match_date)}
                      </span>
                      <div className="shrink-0"><FieldBadge field={m.field} size="xs" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-chalk truncate">
                          {nm(m, 'a')} <span className="text-dim">–</span> {nm(m, 'b')}
                        </p>
                        <p className="text-[9.5px] text-dim truncate">{m.league?.name}</p>
                      </div>
                      {live ? <span className="text-[8.5px] font-extrabold text-live shrink-0">LIVE</span>
                        : done ? <span className="text-[11px] font-black tnum text-silver shrink-0">{m.goals_team_a}-{m.goals_team_b}</span>
                        : <span className="text-dim text-xs shrink-0">›</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

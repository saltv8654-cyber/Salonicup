import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Watermark, BottomNav, Empty } from '@/app/ui'
import { fmtTime as time, fmtDay as dayLabel, athensDateKey as dayKey } from '@/lib/time'

export const revalidate = 30

export default async function SchedulePage() {
  const supabase = createClient()

  const { data: slots } = await supabase
    .from('slots')
    .select(`
      slot_id, field, starts_at,
      venue:venue_id(venue_id, name),
      match:match_id(
        match_id, round, match_status,
        goals_team_a, goals_team_b,
        league:league_id(name),
        team_a_data:team_a(name),
        team_b_data:team_b(name)
      )
    `)
    .gte('starts_at', new Date(Date.now() - 86400000).toISOString())
    .order('starts_at')

  // Ομαδοποίηση: ημέρα → γήπεδο
  const groups = new Map<string, Map<string, any[]>>()
  for (const s of slots ?? []) {
    const dk = dayKey(s.starts_at)
    const vk = (s.venue as any)?.name ?? '—'
    if (!groups.has(dk)) groups.set(dk, new Map())
    const byVenue = groups.get(dk)!
    if (!byVenue.has(vk)) byVenue.set(vk, [])
    byVenue.get(vk)!.push(s)
  }

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <header className="relative px-4 pt-6 pb-4 overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-36">
          <Watermark opacity={0.05} />
        </div>
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
          Salonicup
        </p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Πρόγραμμα</h1>
      </header>

      <div className="px-3.5 pb-6">
        {groups.size === 0 ? (
          <Empty>Δεν έχει οριστεί πρόγραμμα.</Empty>
        ) : (
          [...groups.entries()].map(([dk, byVenue]) =>
            [...byVenue.entries()].map(([venueName, list]) => {
              const free = list.filter(s => !s.match).length
              return (
                <div key={dk + venueName} className="mb-6">
                  <div className="flex items-baseline gap-2 mb-2.5 px-1">
                    <h2 className="text-sm font-extrabold text-chalk tracking-tight">
                      {dayLabel(list[0].starts_at)}
                    </h2>
                    <span className="text-[11px] text-dim font-semibold">{venueName}</span>
                    <div className="flex-1" />
                    {free > 0 && (
                      <span className="text-[9.5px] font-extrabold text-lit
                        bg-lit/[0.12] px-2 py-[3px] rounded-full">
                        {free} ΚΕΝΑ
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    {list.map(s => {
                      const m = s.match as any
                      const inner = (
                        <div className={`grid items-center gap-2.5 px-3 py-3 rounded-lg
                          [grid-template-columns:46px_52px_1fr_12px]
                          ${m ? 'bg-turf border border-chalk/[0.04]'
                              : 'bg-transparent border border-dashed border-lit/30'}`}>
                          <span className="text-[13px] font-extrabold text-chalk tnum">
                            {time(s.starts_at)}
                          </span>
                          <span className="text-[10px] font-bold text-dim">{s.field}</span>

                          {m ? (
                            <div className="min-w-0">
                              <span className="block text-[13px] font-semibold text-chalk truncate">
                                {m.team_a_data?.name}
                                <span className="text-dim font-normal mx-1">—</span>
                                {m.team_b_data?.name}
                              </span>
                              <span className="block text-[9px] font-extrabold text-lit
                                tracking-[0.08em] mt-0.5">
                                {m.league?.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-lit tracking-[0.04em]">
                              ΕΛΕΥΘΕΡΟ
                            </span>
                          )}

                          <span className="text-[13px] text-off text-right">
                            {m ? '›' : ''}
                          </span>
                        </div>
                      )

                      return m
                        ? <Link key={s.slot_id} href={`/match/${m.match_id}`}
                            className="active:opacity-70">{inner}</Link>
                        : <div key={s.slot_id}>{inner}</div>
                    })}
                  </div>
                </div>
              )
            })
          )
        )}
      </div>

      <BottomNav />
    </div>
  )
}

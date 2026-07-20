import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav, Empty, FieldBadge } from '@/app/ui'
import CaptainGate from '@/app/captain-gate'
import { fmtTime, fmtDay, athensDateKey } from '@/lib/time'

export const revalidate = 30

const since = () => new Date(Date.now() - 86400000).toISOString()

export default async function SchedulePage() {
  const supabase = createClient()

  const [{ data: slots }, { data: matches }] = await Promise.all([
    supabase.from('slots')
      .select('slot_id, field, starts_at, venue:venue_id(name)')
      .gte('starts_at', since()).order('starts_at'),
    supabase.from('matches')
      .select(`match_id, match_date, field, match_status,
        league:league_id(name), team_a_data:team_a(name), team_b_data:team_b(name)`)
      .not('match_date', 'is', null)
      .gte('match_date', since()).order('match_date'),
  ])

  // «Κλεισμένα» κλειδιά: γήπεδο + ώρα (από τα πραγματικά ματς)
  const booked = new Set<string>()
  const key = (f: string | null, iso: string) => `${f ?? ''}|${new Date(iso).getTime()}`
  for (const m of matches ?? []) booked.add(key(m.field, m.match_date))

  // Στοιχεία προς εμφάνιση: όλα τα ματς + όσα slots δεν έχουν ματς εκείνη την ώρα/γήπεδο
  type Item = { iso: string; field: string; match?: any; venue?: string }
  const items: Item[] = []
  for (const m of matches ?? []) items.push({ iso: m.match_date, field: m.field, match: m })
  for (const s of slots ?? []) {
    if (!booked.has(key(s.field, s.starts_at)))
      items.push({ iso: s.starts_at, field: s.field, venue: (s.venue as any)?.name })
  }

  // Ομαδοποίηση ανά ημέρα
  const byDay = new Map<string, Item[]>()
  for (const it of items) {
    const k = athensDateKey(it.iso)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(it)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, list]) => ({
      key: k,
      label: fmtDay(list[0].iso),
      list: list.slice().sort((a, b) =>
        a.iso.localeCompare(b.iso) || a.field.localeCompare(b.field)),
      free: list.filter(x => !x.match).length,
    }))

  return (
    <CaptainGate>
      <div className="min-h-screen bg-pitch pb-20">
        <header className="px-4 pt-6 pb-3">
          <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
          <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Γήπεδα</h1>
        </header>

        <div className="px-3.5 pt-1 flex flex-col gap-4">
          {!days.length ? (
            <Empty>Δεν έχει οριστεί πρόγραμμα γηπέδων.</Empty>
          ) : days.map(d => (
            <div key={d.key}>
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit">
                  {d.label}
                </p>
                {d.free > 0 && (
                  <span className="text-[9px] font-extrabold text-lit bg-lit/[0.12]
                    px-2 py-[2px] rounded-full">{d.free} ΕΛΕΥΘΕΡΑ</span>
                )}
              </div>
              <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                {d.list.map((it, i) => {
                  const m = it.match
                  const live = m?.match_status === 'Live'
                  const done = m && ['Played', 'Forfeit'].includes(m.match_status)
                  const inner = (
                    <div className={`flex items-center gap-2.5 px-3 py-2.5
                      ${i ? 'border-t border-chalk/[0.05]' : ''}
                      ${!m ? 'bg-lit/[0.05]' : ''}`}>
                      <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">
                        {fmtTime(it.iso)}
                      </span>
                      <div className="shrink-0"><FieldBadge field={it.field} size="xs" /></div>
                      <div className="flex-1 min-w-0">
                        {m ? (
                          <>
                            <p className="text-[12.5px] font-semibold text-chalk truncate">
                              {m.team_a_data?.name} <span className="text-dim">–</span> {m.team_b_data?.name}
                            </p>
                            <p className="text-[9.5px] text-dim truncate">{m.league?.name}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[12.5px] font-extrabold text-lit tracking-[0.04em]">ΕΛΕΥΘΕΡΟ</p>
                            {it.venue && <p className="text-[9.5px] text-off truncate">{it.venue}</p>}
                          </>
                        )}
                      </div>
                      {live && <span className="text-[8.5px] font-extrabold text-live shrink-0">LIVE</span>}
                      {done && <span className="text-[8.5px] font-extrabold text-dim shrink-0">ΤΕΛ</span>}
                      {m && !live && !done && <span className="text-dim text-xs shrink-0">›</span>}
                    </div>
                  )
                  return m
                    ? <Link key={m.match_id} href={`/match/${m.match_id}`} className="block active:bg-[#1C1C22]">{inner}</Link>
                    : <div key={`f-${it.iso}-${it.field}`}>{inner}</div>
                })}
              </div>
            </div>
          ))}
        </div>

        <BottomNav />
      </div>
    </CaptainGate>
  )
}

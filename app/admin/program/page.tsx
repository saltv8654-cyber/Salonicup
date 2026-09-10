import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FieldBadge, Empty } from '@/app/ui'
import { fmtTime, fmtDay, athensDateKey } from '@/lib/time'

export const dynamic = 'force-dynamic'

const since = () => new Date(Date.now() - 86400000).toISOString()
const key = (f: string | null, iso: string) => `${f ?? ''}|${new Date(iso).getTime()}`

const RESP: Record<string, { t: string; bg: string; fg: string }> = {
  ok:         { t: 'ΟΚ',           bg: 'rgba(47,168,79,0.16)',  fg: '#2FA84F' },
  reschedule: { t: 'αλλαγή ώρας',  bg: 'rgba(201,162,39,0.18)', fg: '#e8b923' },
  postpone:   { t: 'αναβολή',      bg: 'rgba(216,72,60,0.16)',  fg: '#D8483C' },
}
function Pill({ s }: { s: string }) {
  const p = RESP[s]; if (!p) return null
  return <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0"
    style={{ background: p.bg, color: p.fg }}>{p.t}</span>
}

export default async function AdminProgram() {
  const supabase = createClient()
  const [{ data: matches }, { data: slots }, { data: resp }] = await Promise.all([
    supabase.from('matches')
      .select(`match_id, match_date, field, match_status, goals_team_a, goals_team_b,
        team_a, team_b, placeholder_a, placeholder_b,
        league:league_id(name), team_a_data:team_a(name), team_b_data:team_b(name)`)
      .not('match_date', 'is', null).gte('match_date', since()).order('match_date'),
    supabase.from('slots').select('field, starts_at, venue:venue_id(name)').gte('starts_at', since()).order('starts_at'),
    supabase.from('match_responses').select('match_id, team_id, status, note'),
  ])

  // Απαντήσεις captains ανά αγώνα → πλευρά a/b
  const respBy = new Map<string, { a?: any; b?: any }>()
  const mById = new Map((matches ?? []).map((m: any) => [m.match_id, m]))
  for (const r of resp ?? []) {
    const m: any = mById.get(r.match_id); if (!m) continue
    const side = r.team_id === m.team_a ? 'a' : r.team_id === m.team_b ? 'b' : null
    if (!side) continue
    if (!respBy.has(r.match_id)) respBy.set(r.match_id, {})
    respBy.get(r.match_id)![side] = r
  }

  // Ελεύθερα slots (όσα δεν έχουν ματς εκείνη την ώρα/γήπεδο)
  const booked = new Set<string>()
  for (const m of matches ?? []) booked.add(key(m.field, m.match_date))

  type Item = { iso: string; field: string | null; match?: any; venue?: string }
  const items: Item[] = []
  for (const m of matches ?? []) items.push({ iso: m.match_date, field: m.field, match: m })
  for (const s of slots ?? []) if (!booked.has(key(s.field, s.starts_at)))
    items.push({ iso: s.starts_at, field: s.field, venue: (s.venue as any)?.name })

  const byDay = new Map<string, Item[]>()
  for (const it of items) {
    const k = athensDateKey(it.iso)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(it)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => ({
    key: k, label: fmtDay(list[0].iso),
    list: list.sort((a, b) => a.iso.localeCompare(b.iso) || (a.field ?? '').localeCompare(b.field ?? '')),
    free: list.filter(x => !x.match).length,
  }))

  const nm = (m: any, s: 'a' | 'b') =>
    (s === 'a' ? m.team_a_data : m.team_b_data)?.name ?? (s === 'a' ? m.placeholder_a : m.placeholder_b) ?? '—'

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-3">Ημερολόγιο</h1>

      {!days.length ? <Empty>Δεν υπάρχει πρόγραμμα.</Empty> : (
        <div className="flex flex-col gap-4">
          {days.map(d => (
            <div key={d.key}>
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit">{d.label}</p>
                {d.free > 0 && <span className="text-[9px] font-extrabold text-lit bg-lit/[0.12] px-2 py-[2px] rounded-full">{d.free} ΕΛΕΥΘΕΡΑ</span>}
              </div>
              <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                {d.list.map((it, i) => {
                  const m = it.match
                  const live = m?.match_status === 'Live'
                  const done = m && ['Played', 'Forfeit'].includes(m.match_status)
                  const rr = m ? respBy.get(m.match_id) : null
                  const inner = (
                    <div className={`px-3 py-2.5 ${i ? 'border-t border-chalk/[0.05]' : ''} ${!m ? 'bg-lit/[0.05]' : ''}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">{fmtTime(it.iso)}</span>
                        <div className="shrink-0"><FieldBadge field={it.field} size="xs" /></div>
                        <div className="flex-1 min-w-0">
                          {m ? (
                            <>
                              <p className="text-[12.5px] font-semibold text-chalk truncate">{nm(m, 'a')} <span className="text-dim">–</span> {nm(m, 'b')}</p>
                              <p className="text-[9.5px] text-dim truncate">{m.league?.name}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-[12.5px] font-extrabold text-lit tracking-[0.04em]">ΕΛΕΥΘΕΡΟ</p>
                              {it.venue && <p className="text-[9.5px] text-off truncate">{it.venue}</p>}
                            </>
                          )}
                        </div>
                        {live ? <span className="text-[8.5px] font-extrabold text-live shrink-0">LIVE</span>
                          : done ? <span className="text-[11px] font-black tnum text-silver shrink-0">{m.goals_team_a}-{m.goals_team_b}</span>
                          : m ? <span className="text-dim text-xs shrink-0">›</span> : null}
                      </div>
                      {rr && (rr.a || rr.b) && (
                        <div className="flex flex-col gap-0.5 mt-1.5 pl-[58px]">
                          {(['a', 'b'] as const).map(s => rr[s] && (
                            <div key={s} className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-silver font-bold truncate max-w-[45%]">{nm(m, s)}</span>
                              <Pill s={rr[s].status} />
                              {rr[s].note && <span className="text-off truncate">«{rr[s].note}»</span>}
                            </div>
                          ))}
                        </div>
                      )}
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
      )}
    </div>
  )
}

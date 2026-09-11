import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav, Empty, FieldBadge } from '@/app/ui'
import CaptainGate from '@/app/captain-gate'
import LogoutButton from '@/app/logout-button'
import MatchResponse from './match-response'
import ChangeBanner from './change-banner'
import WeekAccordion, { type Week } from './week-accordion'
import { fmtTime, fmtDay, athensDateKey } from '@/lib/time'

const GRMON = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']
const weekLabel = (iso: string) => {
  const d = new Date(iso)
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  return mon.getMonth() === sun.getMonth()
    ? `${mon.getDate()}–${sun.getDate()} ${GRMON[sun.getMonth()]}`
    : `${mon.getDate()} ${GRMON[mon.getMonth()]} – ${sun.getDate()} ${GRMON[sun.getMonth()]}`
}

export const revalidate = 30

const since = () => new Date(Date.now() - 86400000).toISOString()

export default async function SchedulePage() {
  const supabase = createClient()

  const [{ data: slots }, { data: matches }] = await Promise.all([
    supabase.from('slots')
      .select('slot_id, field, starts_at, venue:venue_id(name)')
      .gte('starts_at', since()).order('starts_at'),
    supabase.from('matches')
      .select(`match_id, match_date, field, match_status, placeholder_a, placeholder_b, team_a, team_b,
        league:league_id(name), team_a_data:team_a(name), team_b_data:team_b(name)`)
      .not('match_date', 'is', null)
      .gte('match_date', since()).order('match_date'),
  ])

  // «Κλεισμένα» κλειδιά: γήπεδο + ώρα (από τα πραγματικά ματς)
  const booked = new Set<string>()
  const key = (f: string | null, iso: string) => `${f ?? ''}|${new Date(iso).getTime()}`
  for (const m of matches ?? []) booked.add(key(m.field, m.match_date))

  // Ελεύθερα slots (για την επιλογή «Αλλαγή ώρας» του captain)
  const freeSlots = (slots ?? [])
    .filter(s => !booked.has(key(s.field, s.starts_at)))
    .map(s => ({ iso: s.starts_at, field: s.field, venue: (s.venue as any)?.name ?? null }))

  // Στοιχεία προς εμφάνιση: όλα τα ματς + όσα slots δεν έχουν ματς εκείνη την ώρα/γήπεδο
  type Item = { iso: string; field: string | null; match?: any; venue?: string }
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
        a.iso.localeCompare(b.iso) || (a.field ?? '').localeCompare(b.field ?? '')),
      free: list.filter(x => !x.match).length,
    }))

  // Χωρισμός σε «τρέχουσα εβδομάδα» (η πρώτη με αγώνες) + επόμενες
  const wk = (iso: string) => {
    const d = new Date(iso)
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
    return `${m.getFullYear()}-${m.getMonth()}-${m.getDate()}`
  }
  const dayBlock = (d: (typeof days)[number]) => (
    <div key={d.key}>
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit">{d.label}</p>
        {d.free > 0 && (
          <span className="text-[9px] font-extrabold text-lit bg-lit/[0.12] px-2 py-[2px] rounded-full">{d.free} ΕΛΕΥΘΕΡΑ</span>
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
              <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">{fmtTime(it.iso)}</span>
              <div className="shrink-0"><FieldBadge field={it.field} size="xs" /></div>
              <div className="flex-1 min-w-0">
                {m ? (
                  <>
                    <p className="text-[12.5px] font-semibold text-chalk truncate">
                      {m.team_a_data?.name ?? m.placeholder_a ?? 'Εκκρεμεί'} <span className="text-dim">–</span> {m.team_b_data?.name ?? m.placeholder_b ?? 'Εκκρεμεί'}
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
            ? (
              <div key={m.match_id}>
                <Link href={`/match/${m.match_id}`} className="block active:bg-[#1C1C22]">{inner}</Link>
                {!done && !live && (
                  <div className="px-3 pb-2.5 -mt-0.5"><MatchResponse match={m} freeSlots={freeSlots} /></div>
                )}
              </div>
            )
            : <div key={`f-${it.iso}-${it.field}`}>{inner}</div>
        })}
      </div>
    </div>
  )

  // Ομαδοποίηση ημερών ανά εβδομάδα (πτυσσόμενο)
  const weekMap = new Map<string, (typeof days)>()
  for (const d of days) {
    const k = wk(d.list[0].iso)
    if (!weekMap.has(k)) weekMap.set(k, [])
    weekMap.get(k)!.push(d)
  }
  const weeks: Week[] = [...weekMap.entries()].map(([k, ds]) => ({
    key: k,
    label: weekLabel(ds[0].list[0].iso),
    free: ds.reduce((s, d) => s + d.free, 0),
    count: ds.reduce((s, d) => s + (d.list.length - d.free), 0),
    body: <>{ds.map(dayBlock)}</>,
  }))

  return (
    <CaptainGate>
      <div className="min-h-screen bg-pitch pb-20">
        <header className="relative px-4 pt-6 pb-3">
          <div className="absolute right-4 top-6 flex items-center gap-2 z-10">
            <Link href="/" aria-label="Αρχική"
              className="w-9 h-9 rounded-lg bg-chalk/[0.06]
                grid place-items-center text-silver text-lg active:bg-chalk/10">🏠</Link>
            <LogoutButton />
          </div>
          <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
          <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Γήπεδα</h1>
        </header>

        <ChangeBanner />

        <div className="px-3.5 pt-1 flex flex-col gap-4">
          {!days.length ? (
            <Empty>Δεν έχει οριστεί πρόγραμμα γηπέδων.</Empty>
          ) : (
            <WeekAccordion weeks={weeks} />
          )}
        </div>

        <BottomNav />
      </div>
    </CaptainGate>
  )
}

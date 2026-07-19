import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Crest, LiveDot, BottomNav, Empty, Watermark, FieldBadge } from './ui'
import NotificationsBell from './notifications-bell'
import { athensDateKey, fmtDay, fmtTime } from '@/lib/time'

export const revalidate = 15

export default async function Home({
  searchParams,
}: { searchParams: { date?: string } }) {
  const supabase = createClient()

  const { data: rows } = await supabase
    .from('matches')
    .select(`
      *,
      team_a_data:team_a(name, logo_url),
      team_b_data:team_b(name, logo_url),
      league:league_id(name, logo_url, sort_order)
    `)
    .order('match_date', { ascending: true })

  const matches = rows ?? []

  // Ομαδοποίηση ανά ημέρα (ζώνη Ελλάδας)
  const byDay = new Map<string, any[]>()
  const undated: any[] = []
  for (const m of matches) {
    if (!m.match_date) { undated.push(m); continue }
    const k = athensDateKey(m.match_date)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(m)
  }

  const now = new Date()
  const todayKey = athensDateKey(now.toISOString())
  const yestKey  = athensDateKey(new Date(now.getTime() - 86400000).toISOString())
  const tomKey   = athensDateKey(new Date(now.getTime() + 86400000).toISOString())

  const days = [...byDay.keys()].sort()
  const selected = searchParams.date && (byDay.has(searchParams.date) || searchParams.date === 'none')
    ? searchParams.date
    : byDay.has(todayKey) ? todayKey
    : days.find(d => d >= todayKey) ?? days[days.length - 1] ?? (undated.length ? 'none' : todayKey)

  const dayLabel = (key: string, sampleIso: string) =>
    key === todayKey ? 'Σήμερα'
    : key === yestKey ? 'Χθες'
    : key === tomKey ? 'Αύριο'
    : fmtDay(sampleIso)

  const tabs: { key: string; label: string }[] = days.map(k => ({
    key: k, label: dayLabel(k, byDay.get(k)![0].match_date),
  }))
  if (undated.length) tabs.push({ key: 'none', label: 'Χωρίς ημ/νία' })

  const dayMatches = selected === 'none' ? undated : (byDay.get(selected) ?? [])

  // Ομαδοποίηση ανά διοργάνωση
  const leagues = new Map<string, { name: string; logo: string | null; order: number; list: any[] }>()
  for (const m of dayMatches) {
    const key = m.league_id
    if (!leagues.has(key)) leagues.set(key, {
      name: m.league?.name ?? '—', logo: m.league?.logo_url ?? null,
      order: m.league?.sort_order ?? 0, list: [],
    })
    leagues.get(key)!.list.push(m)
  }
  const leagueGroups = [...leagues.values()].sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <header className="relative px-4 pt-6 pb-3 overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-36">
          <Watermark opacity={0.05} />
        </div>
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
            <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Αγώνες</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/search" aria-label="Αναζήτηση"
              className="relative z-10 w-[38px] h-[38px] rounded-full grid place-items-center
                text-base bg-turf border border-chalk/[0.08] text-silver">
              🔎
            </Link>
            <Link href="/settings/notifications" aria-label="Ρυθμίσεις ειδοποιήσεων"
              className="relative z-10 w-[38px] h-[38px] rounded-full grid place-items-center
                text-base bg-turf border border-chalk/[0.08] text-silver">
              ⚙️
            </Link>
            <NotificationsBell />
          </div>
        </div>
      </header>

      {/* Καρτέλες ημερών */}
      {tabs.length > 0 && (
        <div className="flex gap-1 px-3.5 pb-3 overflow-x-auto border-b border-chalk/[0.06]">
          {tabs.map(t => {
            const on = t.key === selected
            return (
              <Link key={t.key} href={`/?date=${t.key}`}
                className={`shrink-0 px-3.5 py-2 text-[12.5px] font-bold whitespace-nowrap
                  border-b-2 -mb-[1px] transition-colors
                  ${on ? 'text-lit border-lit' : 'text-dim border-transparent'}`}>
                {t.label}
              </Link>
            )
          })}
        </div>
      )}

      <div className="px-3.5 pt-4">
        {!leagueGroups.length ? (
          <Empty>Δεν υπάρχουν αγώνες.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {leagueGroups.map((g, gi) => (
              <div key={gi}>
                {/* Κεφαλίδα διοργάνωσης */}
                <div className="flex items-center gap-2.5 px-1 mb-2">
                  {g.logo
                    ? <img src={g.logo} alt="" className="w-5 h-5 object-contain" />
                    : <span className="text-base">🏆</span>}
                  <span className="text-[13px] font-extrabold text-chalk">{g.name}</span>
                </div>
                <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                  {g.list.map((m, i) => (
                    <MatchRow key={m.match_id} m={m} first={i === 0} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

function MatchRow({ m, first }: { m: any; first: boolean }) {
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)

  return (
    <Link href={`/match/${m.match_id}`}
      className={`block px-3 py-3 active:bg-[#1C1C22]
        ${first ? '' : 'border-t border-chalk/[0.05]'}`}>
      <div className="grid items-center gap-2 [grid-template-columns:1fr_54px_1fr]">
        {/* Γηπεδούχος */}
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-chalk truncate text-right">
            {m.team_a_data?.name}
          </span>
          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={22} />
        </div>

        {/* Κέντρο: σκορ ή ώρα */}
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

        {/* Φιλοξενούμενος */}
        <div className="flex items-center justify-start gap-2 min-w-0">
          <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={22} />
          <span className="text-[13px] font-semibold text-chalk truncate">
            {m.team_b_data?.name}
          </span>
        </div>
      </div>

      {/* Γήπεδο — χρωματιστό ανά γήπεδο */}
      {m.field && (
        <div className="flex justify-center mt-1.5">
          <FieldBadge field={m.field} />
        </div>
      )}
    </Link>
  )
}

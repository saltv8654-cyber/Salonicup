import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Crest, LiveDot, SectionLabel, BottomNav, Empty } from '@/app/ui'
import type { League } from '@/lib/types'

export const revalidate = 15

function fmtDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const days = ['ΚΥΡ','ΔΕΥ','ΤΡΙ','ΤΕΤ','ΠΕΜ','ΠΑΡ','ΣΑΒ']
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${hh}:${mm}`
}

export default async function MatchesPage({
  searchParams,
}: { searchParams: { league?: string } }) {
  const supabase = createClient()

  const { data: leagues } = await supabase
    .from('leagues').select('*').eq('active', true).order('sort_order')

  const active: League | undefined =
    leagues?.find(l => l.league_id === searchParams.league) ?? leagues?.[0]

  const { data: matches } = active
    ? await supabase
        .from('matches')
        .select(`
          *,
          team_a_data:team_a(name, logo_url),
          team_b_data:team_b(name, logo_url),
          venue:venue_id(name)
        `)
        .eq('league_id', active.league_id)
        .order('round', { ascending: false })
        .order('match_date')
    : { data: [] as any[] }

  const live = matches?.filter(m => m.match_status === 'Live') ?? []
  const next = matches?.filter(m => m.match_status === 'Scheduled') ?? []
  const done = matches?.filter(m => ['Played', 'Forfeit'].includes(m.match_status)) ?? []

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <header className="relative px-4 pt-6 pb-4 overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-36">
          <Watermark opacity={0.05} />
        </div>
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
          Salonicup
        </p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Αγώνες</h1>
      </header>

      <div className="flex gap-2 px-3.5 pb-4 overflow-x-auto">
        {leagues?.map(l => {
          const on = active?.league_id === l.league_id
          return (
            <Link key={l.league_id} href={`/matches?league=${l.league_id}`}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full
                text-[11.5px] font-bold whitespace-nowrap border
                ${on ? 'bg-brand text-chalk border-lit'
                     : 'bg-turf text-dim border-chalk/[0.06]'}`}>
              {l.logo_url && <img src={l.logo_url} alt="" className="w-4 h-4 object-contain" />}
              {l.name}
            </Link>
          )
        })}
      </div>

      <div className="px-3.5 pb-6">
        {live.length > 0 && (
          <>
            <SectionLabel live>Σε εξέλιξη</SectionLabel>
            <div className="flex flex-col gap-1.5 mb-5">
              {live.map(m => <Row key={m.match_id} m={m} />)}
            </div>
          </>
        )}

        {next.length > 0 && (
          <>
            <SectionLabel>Επόμενοι</SectionLabel>
            <div className="flex flex-col gap-1.5 mb-5">
              {next.map(m => <Row key={m.match_id} m={m} />)}
            </div>
          </>
        )}

        {done.length > 0 && (
          <>
            <SectionLabel>Αποτελέσματα</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {done.map(m => <Row key={m.match_id} m={m} />)}
            </div>
          </>
        )}

        {!matches?.length && <Empty>Δεν υπάρχουν αγώνες.</Empty>}
      </div>

      <BottomNav />
    </div>
  )
}

function Row({ m }: { m: any }) {
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)
  const place = [m.venue?.name, m.field].filter(Boolean).join(' · ')

  return (
    <Link href={`/match/${m.match_id}`}
      className={`block bg-turf rounded-lg px-3.5 py-3 border active:bg-[#1C1C22]
        ${live ? 'border-live/35' : 'border-chalk/[0.04]'}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[9.5px] text-dim font-bold">
          Αγ. {m.round}{m.match_date ? ` · ${fmtDate(m.match_date)}` : ''}
        </span>
        {live && <LiveDot />}
      </div>

      <div className="grid items-center gap-2 [grid-template-columns:1fr_50px_1fr]">
        <div className="flex items-center gap-2 min-w-0">
          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={22} />
          <span className="text-[13px] font-semibold text-chalk truncate">
            {m.team_a_data?.name}
          </span>
        </div>

        <div className="text-center">
          {live || done ? (
            <span className="text-lg font-extrabold text-chalk tnum">
              {m.goals_team_a}<span className="text-off mx-1">·</span>{m.goals_team_b}
            </span>
          ) : (
            <span className="text-[11px] font-extrabold text-off">VS</span>
          )}
          {(m.pens_team_a > 0 || m.pens_team_b > 0) && (
            <div className="text-[9px] font-extrabold text-lit tnum mt-0.5">
              πέν. {m.pens_team_a}–{m.pens_team_b}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="text-[13px] font-semibold text-chalk truncate text-right">
            {m.team_b_data?.name}
          </span>
          <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={22} />
        </div>
      </div>

      {place && (
        <p className="text-[9.5px] text-off text-center mt-2.5 pt-2
          border-t border-chalk/[0.05]">{place}</p>
      )}
    </Link>
  )
}

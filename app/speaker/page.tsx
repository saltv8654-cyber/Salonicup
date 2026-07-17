import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Watermark, Crest, LiveDot, SectionLabel, Empty } from '@/app/ui'
import { fmtDateTime as fmt, isTodayAthens as isToday } from '@/lib/time'

export const dynamic = 'force-dynamic'

export default async function SpeakerHome() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/speaker')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!profile || !['admin', 'speaker'].includes(profile.role)) {
    redirect('/')
  }

  const { data: matches } = await supabase
    .from('matches')
    .select(`
      *,
      team_a_data:team_a(name, logo_url),
      team_b_data:team_b(name, logo_url),
      league:league_id(name),
      venue:venue_id(name)
    `)
    .in('match_status', ['Scheduled', 'Live', 'Played'])
    .order('match_date', { ascending: true })
    .limit(40)

  const live  = matches?.filter(m => m.match_status === 'Live') ?? []
  const today = matches?.filter(m =>
    m.match_status === 'Scheduled' && isToday(m.match_date)) ?? []
  const soon  = matches?.filter(m =>
    m.match_status === 'Scheduled' && !isToday(m.match_date)) ?? []
  const past  = matches?.filter(m => m.match_status === 'Played') ?? []

  return (
    <div className="min-h-screen bg-pitch pb-10">
      <header className="relative px-4 pt-6 pb-5 overflow-hidden">
        <div className="absolute -right-7 -top-5 w-44 h-48">
          <Watermark opacity={0.045} />
        </div>
        <Link href="/" aria-label="Αρχική"
          className="absolute right-4 top-6 w-9 h-9 rounded-lg bg-chalk/[0.06] z-10
            grid place-items-center text-silver text-lg active:bg-chalk/10">🏠</Link>
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
          Salonicup · Speaker
        </p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1.5 tracking-tight">
          Οι αγώνες μου
        </h1>
      </header>

      <div className="px-3.5">
        {live.length > 0 && (
          <Group label="Σε εξέλιξη" live>{live.map(m => <Row key={m.match_id} m={m} />)}</Group>
        )}
        {today.length > 0 && (
          <Group label="Σήμερα">{today.map(m => <Row key={m.match_id} m={m} />)}</Group>
        )}
        {soon.length > 0 && (
          <Group label="Επόμενοι">{soon.map(m => <Row key={m.match_id} m={m} />)}</Group>
        )}
        {past.length > 0 && (
          <Group label="Ολοκληρωμένοι">{past.map(m => <Row key={m.match_id} m={m} />)}</Group>
        )}

        {!matches?.length && <Empty>Δεν υπάρχουν αγώνες.</Empty>}
      </div>
    </div>
  )
}

function Group({ label, live, children }: {
  label: string; live?: boolean; children: React.ReactNode
}) {
  return (
    <section className="mb-5">
      <SectionLabel live={live}>{label}</SectionLabel>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

function Row({ m }: { m: any }) {
  const live = m.match_status === 'Live'
  const done = m.match_status === 'Played'
  const place = [m.venue?.name, m.field].filter(Boolean).join(' · ')

  return (
    <Link href={`/speaker/${m.match_id}`}
      className={`block bg-turf rounded-xl px-3.5 py-3 border active:bg-[#1C1C22]
        ${live ? 'border-live/35' : 'border-chalk/[0.05]'}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[9.5px] text-dim font-bold">
          {m.league?.name} · Αγ. {m.round}
        </span>
        {live ? <LiveDot /> : (
          <span className="text-[9.5px] text-dim font-bold">
            {done ? 'ΤΕΛΙΚΟ' : fmt(m.match_date)}
          </span>
        )}
      </div>

      <div className="grid items-center gap-2 [grid-template-columns:1fr_52px_1fr]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={26} />
          <span className="text-sm font-semibold text-chalk truncate">
            {m.team_a_data?.name}
          </span>
        </div>

        <div className="text-center">
          {live || done ? (
            <span className="text-[22px] font-extrabold text-chalk tnum leading-none">
              {m.goals_team_a}<span className="text-off mx-0.5">·</span>{m.goals_team_b}
            </span>
          ) : (
            <span className="text-xs font-extrabold text-off">VS</span>
          )}
        </div>

        <div className="flex items-center gap-2.5 min-w-0 justify-end">
          <span className="text-sm font-semibold text-chalk truncate text-right">
            {m.team_b_data?.name}
          </span>
          <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={26} />
        </div>
      </div>

      {place && (
        <p className="text-[9.5px] text-off text-center mt-2.5 pt-2
          border-t border-chalk/[0.05]">{place}</p>
      )}
    </Link>
  )
}

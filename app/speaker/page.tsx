import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Watermark } from '@/app/ui'
import SpeakerList from './list'

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

  const SELECT = `
      *,
      team_a_data:team_a(name, logo_url),
      team_b_data:team_b(name, logo_url),
      league:league_id(name),
      venue:venue_id(name)
    `
  // Ξεχωριστά ερωτήματα ώστε οι ολοκληρωμένοι να μη «κόβονται» από τους πολλούς
  // προγραμματισμένους (κοινό όριο θα γέμιζε με μελλοντικές ημερομηνίες).
  const [finished, upcoming, leaguesRes] = await Promise.all([
    supabase.from('matches').select(SELECT)
      .in('match_status', ['Played', 'Forfeit'])
      .order('match_date', { ascending: false }),
    supabase.from('matches').select(SELECT)
      .in('match_status', ['Scheduled', 'Live', 'Postponed'])
      .order('match_date', { ascending: true }),
    supabase.from('leagues').select('league_id, name').order('sort_order'),
  ])
  const matches = [...(finished.data ?? []), ...(upcoming.data ?? [])]

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
          Αγώνες
        </h1>
      </header>

      <SpeakerList matches={matches ?? []} leagues={leaguesRes.data ?? []} />
    </div>
  )
}

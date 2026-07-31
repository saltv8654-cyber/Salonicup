import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Watermark } from '@/app/ui'
import SpeakerDays from './days'
import LogoutButton from '@/app/logout-button'

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

  const isAdmin = profile.role === 'admin'

  const SELECT = `
      *,
      team_a_data:team_a(name, logo_url),
      team_b_data:team_b(name, logo_url),
      league:league_id(name),
      venue:venue_id(name)
    `
  // Ο σπίκερ βλέπει ΜΟΝΟ τους δικούς του αγώνες (speaker_id = ο ίδιος)·
  // ο διαχειριστής τους βλέπει όλους.
  const base = () => {
    const q = supabase.from('matches').select(SELECT)
    return isAdmin ? q : q.eq('speaker_id', user.id)
  }
  const { data: matches } = await base().order('match_date', { ascending: true })

  return (
    <div className="min-h-screen bg-pitch pb-10">
      <header className="relative px-4 pt-6 pb-5 overflow-hidden">
        <div className="absolute -right-7 -top-5 w-44 h-48">
          <Watermark opacity={0.045} />
        </div>
        <div className="absolute right-4 top-6 flex items-center gap-2 z-10">
          <Link href="/" aria-label="Αρχική"
            className="w-9 h-9 rounded-lg bg-chalk/[0.06]
              grid place-items-center text-silver text-lg active:bg-chalk/10">🏠</Link>
          <LogoutButton />
        </div>
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
          Salonicup · Speaker
        </p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1.5 tracking-tight">
          Αγώνες
        </h1>
      </header>

      <SpeakerDays matches={matches ?? []} isAdmin={isAdmin} />
    </div>
  )
}

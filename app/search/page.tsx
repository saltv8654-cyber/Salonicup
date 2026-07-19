import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/app/ui'
import SearchView from './view'

export const revalidate = 60

export default async function SearchPage() {
  const supabase = createClient()

  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase.from('teams')
      .select('team_id, name, logo_url, league:league_id(name)')
      .eq('active', true),
    supabase.from('players')
      .select('player_id, full_name, number, photo_url, team:team_id(name, logo_url)')
      .eq('active', true),
  ])

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <SearchView
        teams={(teams ?? []) as any[]}
        players={(players ?? []) as any[]}
      />
      <BottomNav />
    </div>
  )
}

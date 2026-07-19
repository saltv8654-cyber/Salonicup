import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/app/ui'
import NotificationSettings from './view'

export const revalidate = 60

export default async function NotificationSettingsPage() {
  const supabase = createClient()
  const { data: leagues } = await supabase
    .from('leagues').select('league_id, name, logo_url')
    .eq('active', true).order('sort_order')

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <NotificationSettings leagues={leagues ?? []} />
      <BottomNav />
    </div>
  )
}

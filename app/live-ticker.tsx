'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LiveDot } from '@/app/ui'

/** Κορδέλα με τους αγώνες που παίζονται τώρα — ζωντανή ενημέρωση. */
export default function LiveTicker() {
  const supabase = createClient()
  const [live, setLive] = useState<any[]>([])

  async function fetchLive() {
    const { data } = await supabase.from('matches')
      .select('match_id, goals_team_a, goals_team_b, team_a_data:team_a(name), team_b_data:team_b(name)')
      .eq('match_status', 'Live')
      .order('match_date')
    setLive(data ?? [])
  }

  useEffect(() => {
    fetchLive()
    const ch = supabase.channel('live-ticker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, fetchLive)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fetchLive)
      .subscribe()
    const iv = setInterval(fetchLive, 20000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [])

  if (!live.length) return null

  return (
    <div className="px-3.5 pb-2">
      <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 overflow-x-auto
        border border-live/30 bg-live/[0.06]">
        <span className="shrink-0"><LiveDot /></span>
        <div className="flex gap-2">
          {live.map(m => (
            <Link key={m.match_id} href={`/match/${m.match_id}`}
              className="shrink-0 flex items-center gap-1.5 bg-turf rounded-lg px-2.5 py-1
                border border-chalk/[0.06] active:bg-[#1C1C22]">
              <span className="text-[11.5px] font-semibold text-chalk truncate max-w-[78px]">
                {m.team_a_data?.name}
              </span>
              <span className="text-[12.5px] font-extrabold text-live tnum">
                {m.goals_team_a}-{m.goals_team_b}
              </span>
              <span className="text-[11.5px] font-semibold text-chalk truncate max-w-[78px]">
                {m.team_b_data?.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

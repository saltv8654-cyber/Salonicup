import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/app/ui'
import PlayerView from './view'

export const revalidate = 30

export default async function PlayerPage({ params }: { params: { playerId: string } }) {
  const supabase = createClient()

  const { data: stat } = await supabase
    .from('player_stats').select('*').eq('player_id', params.playerId).single()

  if (!stat) notFound()

  const { data: team } = await supabase
    .from('teams').select('team_id, name, logo_url').eq('team_id', stat.team_id).single()

  // Οι αγώνες όπου συμμετείχε
  const { data: matches } = await supabase
    .from('matches')
    .select(`
      match_id, round, goals_team_a, goals_team_b, team_a, team_b,
      team_a_data:team_a(name, logo_url),
      team_b_data:team_b(name, logo_url)
    `)
    .in('match_status', ['Played', 'Forfeit'])
    .or(`squad_a.cs.{${params.playerId}},squad_b.cs.{${params.playerId}}`)
    .order('round', { ascending: false })

  const { data: events } = await supabase
    .from('events').select('match_id, event_type, period, minute')
    .eq('player_id', params.playerId)

  // Ανά αγωνιστική
  const history = (matches ?? []).map((m: any) => {
    const own = m.team_a === stat.team_id
    const evs = (events ?? []).filter(e => e.match_id === m.match_id)
    return {
      round: m.round,
      opponent: own ? m.team_b_data?.name : m.team_a_data?.name,
      opponentLogo: own ? m.team_b_data?.logo_url : m.team_a_data?.logo_url,
      result: own
        ? `${m.goals_team_a}-${m.goals_team_b}`
        : `${m.goals_team_b}-${m.goals_team_a}`,
      goals:   evs.filter(e => e.event_type === 'GOAL' && e.period !== 'PEN').length,
      assists: evs.filter(e => e.event_type === 'ASSIST').length,
      yellow:  evs.filter(e => e.event_type === 'YELLOW').length,
      red:     evs.filter(e => e.event_type === 'RED').length,
    }
  })

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <PlayerView stat={stat} team={team} history={history} />
      <BottomNav />
    </div>
  )
}

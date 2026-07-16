'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Ζωντανή σύνδεση με έναν αγώνα. Ο speaker γράφει, όλοι βλέπουν. */
export function useLiveMatch(matchId: string) {
  const [match, setMatch]     = useState<any>(null)
  const [events, setEvents]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchMatch = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        mvp:mvp_player_id(player_id, full_name, number, photo_url, team_id),
        team_a_data:team_a(team_id, name, logo_url),
        team_b_data:team_b(team_id, name, logo_url),
        league:league_id(name),
        venue:venue_id(name)
      `)
      .eq('match_id', matchId)
      .single()
    setMatch(data)
  }, [matchId])

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*, player:player_id(player_id, full_name, number, photo_url)')
      .eq('match_id', matchId)
    setEvents(data ?? [])
  }, [matchId])

  useEffect(() => {
    if (!matchId) return
    let alive = true

    Promise.all([fetchMatch(), fetchEvents()])
      .then(() => { if (alive) setLoading(false) })

    const channel = supabase
      .channel(`match:${matchId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `match_id=eq.${matchId}` },
        () => { fetchEvents(); fetchMatch() })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `match_id=eq.${matchId}` },
        () => fetchMatch())
      .subscribe()

    return () => { alive = false; supabase.removeChannel(channel) }
  }, [matchId, fetchMatch, fetchEvents])

  return { match, events, loading, refresh: fetchEvents }
}

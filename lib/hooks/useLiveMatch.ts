'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Ζωντανή σύνδεση με έναν αγώνα. Ο speaker γράφει, όλοι βλέπουν. */
export function useLiveMatch(matchId: string) {
  const [match, setMatch]     = useState<any>(null)
  const [events, setEvents]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // Χρόνος τελευταίας ΕΠΙΤΥΧΟΥΣ ενημέρωσης — για τον watchdog του overlay (OBS)
  const [lastSync, setLastSync] = useState(() => Date.now())
  const supabase = createClient()

  const fetchMatch = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          mvp:mvp_player_id(player_id, full_name, number, photo_url, team_id),
          setter:squad_set_by(full_name),
          team_a_data:team_a(team_id, name, logo_url),
          team_b_data:team_b(team_id, name, logo_url),
          league:league_id(name, logo_url),
          venue:venue_id(name)
        `)
        .eq('match_id', matchId)
        .single()
      // Μόνο σε επιτυχία γράφουμε — προσωρινό σφάλμα δικτύου ΔΕΝ σβήνει το scoreboard
      if (!error && data) { setMatch(data); setLastSync(Date.now()) }
    } catch { /* κράτα τα προηγούμενα δεδομένα */ }
  }, [matchId])

  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, player:player_id(player_id, full_name, number, photo_url)')
        .eq('match_id', matchId)
      if (!error && data) { setEvents(data); setLastSync(Date.now()) }
    } catch { /* κράτα τα προηγούμενα δεδομένα */ }
  }, [matchId])

  useEffect(() => {
    if (!matchId) return
    let alive = true
    let channel: any

    Promise.all([fetchMatch(), fetchEvents()])
      .then(() => { if (alive) setLoading(false) })

    // Στήνει (ή ξαναστήνει) το realtime κανάλι. Αν πέσει στο OBS μετά από ώρα,
    // επανασυνδέεται μόνο του ώστε τα push updates να μη «σβήνουν» οριστικά.
    const connect = () => {
      channel = supabase
        .channel(`match:${matchId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'events', filter: `match_id=eq.${matchId}` },
          () => { fetchEvents(); fetchMatch() })
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'matches', filter: `match_id=eq.${matchId}` },
          () => fetchMatch())
        .subscribe((status: string) => {
          if (!alive) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            supabase.removeChannel(channel)
            setTimeout(() => { if (alive) connect() }, 2500)
          }
        })
    }
    connect()

    // Δίχτυ ασφαλείας #2: ακόμη κι αν το realtime μείνει πεσμένο, τραβάμε ξανά
    // τα δεδομένα κάθε 12 δευτ. ώστε σκορ/ρολόι/φάσεις να μένουν φρέσκα.
    const poll = setInterval(() => { if (alive) { fetchMatch(); fetchEvents() } }, 12000)

    // Όταν η σελίδα ξαναγίνεται ορατή (π.χ. εναλλαγή σκηνής στο OBS),
    // φρεσκάρουμε άμεσα και ξαναστήνουμε το κανάλι.
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !alive) return
      fetchMatch(); fetchEvents()
      supabase.removeChannel(channel); connect()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      alive = false
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVis)
      supabase.removeChannel(channel)
    }
  }, [matchId, fetchMatch, fetchEvents])

  return { match, events, loading, lastSync, refresh: fetchEvents }
}

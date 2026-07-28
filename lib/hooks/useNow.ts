'use client'
import { useEffect, useState } from 'react'

/** Επιστρέφει το τρέχον Date.now(), ανανεώνεται κάθε intervalMs — για ζωντανό χρονόμετρο. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, intervalMs)
    // Μόλις ξαναγίνει ορατή η σελίδα (π.χ. εναλλαγή σκηνής OBS), το ρολόι
    // διορθώνεται ακαριαία στο σωστό λεπτό αντί να περιμένει το επόμενο tick.
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [intervalMs])
  return now
}

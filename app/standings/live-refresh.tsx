'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** Ανανεώνει τη server-rendered βαθμολογία ζωντανά όταν αλλάζει σκορ/κατάσταση αγώνα. */
export default function LiveRefresh() {
  const router = useRouter()
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const bump = () => {   // μικρό debounce ώστε να μη ξαναφορτώνει σε κάθε γεγονός
      if (t.current) clearTimeout(t.current)
      t.current = setTimeout(() => router.refresh(), 1200)
    }
    const ch = supabase.channel('standings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, bump)
      .subscribe()
    return () => { if (t.current) clearTimeout(t.current); supabase.removeChannel(ch) }
  }, [])

  return null
}

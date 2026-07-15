'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let alive = true

    async function load(userId: string | undefined) {
      if (!userId) {
        if (alive) { setProfile(null); setLoading(false) }
        return
      }
      const { data } = await supabase
        .from('profiles').select('*').eq('id', userId).single()
      if (alive) { setProfile(data); setLoading(false) }
    }

    supabase.auth.getUser().then(({ data }) => load(data.user?.id))

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id)
    })

    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return {
    profile,
    loading,
    signIn,
    signOut,
    isAdmin:   profile?.role === 'admin',
    isSpeaker: profile?.role === 'admin' || profile?.role === 'speaker',
  }
}

'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { Loading } from '@/app/ui'

/** Δείχνει το περιεχόμενο μόνο σε captain/speaker/admin· αλλιώς επιστρέφει στην αρχική. */
export default function CaptainGate({ children }: { children: React.ReactNode }) {
  const { isCaptain, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !isCaptain) router.replace('/')
  }, [loading, isCaptain])

  if (loading || !isCaptain) return <Loading />
  return <>{children}</>
}

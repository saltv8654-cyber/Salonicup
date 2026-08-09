'use client'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/useAuth'
import { BottomNav, Watermark, Loading } from '@/app/ui'
import TeamOfWeekBuilder from './builder'

export default function TeamOfWeekPage() {
  const { isSpeaker, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-pitch"><Loading /></div>

  return (
    <div className="min-h-screen bg-pitch pb-24">
      <header className="relative px-4 pt-6 pb-4 overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-36"><Watermark opacity={0.05} /></div>
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">🏅 Team of the Week</h1>
      </header>
      <div className="px-3.5">
        {isSpeaker ? <TeamOfWeekBuilder /> : (
          <div className="text-center text-silver text-[13px] py-16 px-6">
            Μόνο speakers/διαχειριστές μπορούν να δηλώσουν την ομάδα της αγωνιστικής.
            <div className="mt-3"><Link href="/auth/login" className="text-lit font-bold underline">Σύνδεση</Link></div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'

const NAV = [
  { href: '/admin',          label: 'Πίνακας',       icon: '📊' },
  { href: '/admin/leagues',  label: 'Πρωταθλήματα',  icon: '🏆' },
  { href: '/admin/teams',    label: 'Ομάδες',        icon: '👕' },
  { href: '/admin/players',  label: 'Παίκτες',       icon: '👤' },
  { href: '/admin/matches',  label: 'Αγώνες',        icon: '⚽' },
  { href: '/admin/cup',      label: 'Κύπελλο',       icon: '🥇' },
  { href: '/admin/draw',     label: 'Κλήρωση',       icon: '🎬' },
  { href: '/admin/schedule', label: 'Πρόγραμμα',     icon: '📋' },
  { href: '/admin/fixtures', label: 'Γεννήτρια',     icon: '🗓️' },
  { href: '/admin/venues',   label: 'Γήπεδα',        icon: '📍' },
  { href: '/admin/slots',    label: 'Ελεύθερα',      icon: '🟢' },
  { href: '/admin/post',     label: 'Post',          icon: '📸' },
  { href: '/admin/toteam',   label: 'Ομάδα αγων.',   icon: '🏅' },
  { href: '/admin/staff',    label: 'Προσωπικό',     icon: '🎬' },
  { href: '/admin/finance',  label: 'Οικονομικά',    icon: '💰' },
  { href: '/admin/sponsors', label: 'Χορηγοί',       icon: '🏢' },
  { href: '/admin/news',     label: 'Νέα',           icon: '📰' },
  { href: '/admin/bet',      label: 'Bet',           icon: '🎲' },
  { href: '/admin/users',    label: 'Χρήστες',       icon: '🔑' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const { profile, isAdmin, loading, signOut } = useAuth()
  const [pending, setPending] = useState(0)  // εκκρεμή αιτήματα captains (αλλαγή/αναβολή)

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/')
  }, [loading, isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    const supabase = createClient()
    const load = () => supabase.from('match_responses')
      .select('match_id', { count: 'exact', head: true })
      .neq('status', 'ok')
      .then(({ count }) => setPending(count ?? 0))
    load()
    const iv = setInterval(load, 60000)  // ανανέωση κάθε λεπτό
    return () => clearInterval(iv)
  }, [isAdmin, path])

  if (loading || !isAdmin) return <Loading />

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <header className="sticky top-0 z-30 bg-pitch/95 backdrop-blur-xl
        border-b border-chalk/[0.06] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[9px] tracking-[0.2em] uppercase text-lit font-extrabold">
            Salonicup
          </p>
          <p className="text-sm font-bold text-chalk">Διαχείριση</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="flex items-center gap-1 text-[10px] font-bold text-silver
            max-w-[180px] truncate">
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-lit to-brand
              grid place-items-center text-[8px] font-black text-white shrink-0">
              {(profile?.full_name?.trim()?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()}
            </span>
            <span className="truncate">{profile?.full_name ?? profile?.email}</span>
          </span>
          <div className="flex items-center gap-2">
            <div className="flex bg-turf rounded-lg p-[3px] border border-chalk/[0.06]">
              <span className="px-2 py-1.5 rounded-md text-[10.5px] font-extrabold
                bg-brand text-chalk">Admin</span>
              <Link href="/speaker"
                className="px-2 py-1.5 rounded-md text-[10.5px] font-bold text-dim">Speaker</Link>
              <Link href="/schedule"
                className="px-2 py-1.5 rounded-md text-[10.5px] font-bold text-dim">Captain</Link>
              <Link href="/"
                className="px-2 py-1.5 rounded-md text-[10.5px] font-bold text-dim">Θεατής</Link>
            </div>
            <button onClick={async () => { await signOut(); router.push('/') }}
              aria-label="Έξοδος"
              className="text-[13px] text-dim font-semibold px-2.5 py-2 bg-turf rounded-lg">
              ⎋
            </button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-pitch/95 backdrop-blur-xl
        border-t border-chalk/[0.06] flex overflow-x-auto z-30">
        {NAV.map(n => {
          const on = n.href === '/admin' ? path === '/admin' : path.startsWith(n.href)
          return (
            <Link key={n.href} href={n.href}
              className={`relative shrink-0 flex-1 min-w-[68px] flex flex-col items-center
                justify-center gap-0.5 py-2.5
                ${on ? 'text-lit' : 'text-dim'}`}>
              <span className={`text-base ${on ? '' : 'opacity-45'}`}>{n.icon}</span>
              <span className="text-[8.5px] font-bold whitespace-nowrap">{n.label}</span>
              {n.href === '/admin/matches' && pending > 0 && (
                <span className="absolute top-1 right-[18%] min-w-[16px] h-[16px] px-1
                  rounded-full bg-danger text-white text-[9px] font-black grid place-items-center leading-none">
                  {pending}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

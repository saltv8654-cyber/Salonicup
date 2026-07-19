'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { Loading } from '@/app/ui'

const NAV = [
  { href: '/admin',          label: 'Πίνακας',       icon: '📊' },
  { href: '/admin/leagues',  label: 'Πρωταθλήματα',  icon: '🏆' },
  { href: '/admin/teams',    label: 'Ομάδες',        icon: '👕' },
  { href: '/admin/players',  label: 'Παίκτες',       icon: '👤' },
  { href: '/admin/matches',  label: 'Αγώνες',        icon: '⚽' },
  { href: '/admin/fixtures', label: 'Γεννήτρια',     icon: '🗓️' },
  { href: '/admin/venues',   label: 'Γήπεδα',        icon: '📍' },
  { href: '/admin/post',     label: 'Post',          icon: '📸' },
  { href: '/admin/users',    label: 'Χρήστες',       icon: '🔑' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const { profile, isAdmin, loading, signOut } = useAuth()

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/')
  }, [loading, isAdmin])

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
        <div className="flex items-center gap-2">
          <Link href="/"
            className="text-[11px] text-dim font-semibold px-3 py-2
              bg-turf rounded-lg">
            Δημόσιο
          </Link>
          <button onClick={async () => { await signOut(); router.push('/') }}
            className="text-[11px] text-dim font-semibold px-3 py-2
              bg-turf rounded-lg">
            Έξοδος
          </button>
        </div>
      </header>

      <main>{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-pitch/95 backdrop-blur-xl
        border-t border-chalk/[0.06] flex overflow-x-auto z-30">
        {NAV.map(n => {
          const on = n.href === '/admin' ? path === '/admin' : path.startsWith(n.href)
          return (
            <Link key={n.href} href={n.href}
              className={`shrink-0 flex-1 min-w-[68px] flex flex-col items-center
                justify-center gap-0.5 py-2.5
                ${on ? 'text-lit' : 'text-dim'}`}>
              <span className={`text-base ${on ? '' : 'opacity-45'}`}>{n.icon}</span>
              <span className="text-[8.5px] font-bold whitespace-nowrap">{n.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

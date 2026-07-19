'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

/* ── Σήμα Salonicup ως υδατογράφημα ── */
export function Watermark({ opacity = 0.055 }: { opacity?: number }) {
  return (
    <svg
      viewBox="0 0 200 240"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity }}
    >
      <path
        d="M100 8L188 44v104c0 44-38 68-88 84-50-16-88-40-88-84V44L100 8z"
        fill="none" stroke="#FF7A2F" strokeWidth="6"
      />
      <path
        d="M100 24L172 54v92c0 36-31 56-72 70-41-14-72-34-72-70V54L100 24z"
        fill="#FF7A2F" opacity="0.3"
      />
      <circle cx="100" cy="110" r="26" fill="none" stroke="#EDEDF0" strokeWidth="3" />
    </svg>
  )
}

/* ── Λογότυπο ομάδας ── */
export function Crest({ url, name, size = 30 }: {
  url?: string | null; name?: string; size?: number
}) {
  if (url) {
    return (
      <img src={url} alt="" style={{ width: size, height: size }}
        className="object-contain shrink-0 rounded" />
    )
  }
  return (
    <div
      style={{ width: size, height: size, borderRadius: size / 5, fontSize: size * 0.4 }}
      className="shrink-0 grid place-items-center font-black text-dim
        bg-gradient-to-br from-brand/20 to-brand/5 border border-lit/25"
    >
      {name?.charAt(0) ?? '?'}
    </div>
  )
}

/* ── Φωτογραφία παίκτη ── */
export function Avatar({ url, name, size = 28, ring }: {
  url?: string | null; name?: string; size?: number; ring?: boolean
}) {
  if (url) {
    return (
      <img src={url} alt="" style={{ width: size, height: size }}
        className={`rounded-full object-cover shrink-0 ${ring ? 'border-2 border-lit/40' : 'border border-lit/20'}`} />
    )
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`rounded-full shrink-0 grid place-items-center font-black text-dim
        bg-gradient-to-br from-[#26262E] to-[#1C1C22]
        ${ring ? 'border-2 border-lit/40' : 'border border-lit/20'}`}
    >
      {name?.charAt(0) ?? '?'}
    </div>
  )
}

/* ── Ένδειξη LIVE ── */
export function LiveDot({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-extrabold
      text-live tracking-[0.1em]">
      <span className="pulse-dot" />{label}
    </span>
  )
}

/* ── Επικεφαλίδα ενότητας ── */
export function SectionLabel({ children, live }: {
  children: React.ReactNode; live?: boolean
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5 px-1">
      {live && <span className="pulse-dot" />}
      <h2 className={`text-[9.5px] font-extrabold uppercase tracking-[0.16em]
        ${live ? 'text-live' : 'text-dim'}`}>
        {children}
      </h2>
      <div className="flex-1 h-px bg-chalk/[0.06]" />
    </div>
  )
}

/* ── Αναβολές: 0/2 σβηστό, 1/2 κίτρινο, 2/2 κόκκινο ── */
export function Postponements({ n, max = 2 }: { n: number; max?: number }) {
  const style =
    n >= max ? 'bg-danger/[0.18] border-danger/45 text-[#E8564A]'
    : n === max - 1 ? 'bg-card/[0.14] border-card/40 text-card'
    : 'bg-transparent border-transparent text-off'
  return (
    <span className={`inline-block text-[10px] font-extrabold px-1.5 py-[3px]
      rounded border leading-none tnum ${style}`}>
      {n}/{max}
    </span>
  )
}

/* ── Κάτω πλοήγηση ── */
const TABS = [
  { href: '/',          label: 'Αγώνες',     icon: '⚽' },
  { href: '/standings', label: 'Βαθμολογία', icon: '🏆' },
  { href: '/stats',     label: 'Σκόρερ',     icon: '📊' },
]

export function BottomNav() {
  const path = usePathname()
  const { isAdmin, isSpeaker, profile } = useAuth()

  const firstName = profile?.full_name?.trim().split(/\s+/)[0]
  const initial = (profile?.full_name?.trim()?.[0] ?? '?').toUpperCase()

  // 4o κουμπί: προσαρμόζεται στην κατάσταση σύνδεσης
  const authTab = isAdmin
    ? { href: '/admin',      label: firstName ?? 'Admin',   icon: '🔑', avatar: initial }
    : isSpeaker
    ? { href: '/speaker',    label: firstName ?? 'Speaker', icon: '🎙️', avatar: initial }
    : profile
    ? { href: '/auth/login', label: firstName ?? 'Προφίλ',  icon: '👤', avatar: initial }
    : { href: '/auth/login', label: 'Είσοδος',              icon: '👤', avatar: null as string | null }

  const tabs = [...TABS.map(t => ({ ...t, avatar: null as string | null })), authTab]

  return (
    <nav className="fixed bottom-0 inset-x-0 h-16 pb-2 flex z-40
      bg-pitch/95 backdrop-blur-xl border-t border-lit/20">
      {tabs.map(t => {
        const on = t.href === '/' ? path === '/' : path.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 pt-2
              ${on ? 'text-lit' : 'text-dim'}`}>
            {t.avatar ? (
              <span className={`w-[22px] h-[22px] rounded-full grid place-items-center
                text-[10px] font-black text-white bg-gradient-to-br from-lit to-brand
                ${on ? 'ring-2 ring-lit/50' : ''}`}>
                {t.avatar}
              </span>
            ) : (
              <span className={`text-lg ${on ? '' : 'opacity-45'}`}>{t.icon}</span>
            )}
            <span className="text-[9.5px] font-bold truncate max-w-[70px]">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/* ── Κενή κατάσταση ── */
export function Empty({ children = 'Δεν υπάρχουν δεδομένα.' }: { children?: React.ReactNode }) {
  return <p className="text-xs text-off text-center py-10">{children}</p>
}

/* ── Φόρτωση ── */
export function Loading() {
  return (
    <div className="min-h-screen grid place-items-center bg-pitch">
      <div className="spinner" />
    </div>
  )
}

'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

/** Κουμπί αποσύνδεσης — μικρό εικονίδιο για headers (speaker/captain). */
export default function LogoutButton({ className }: { className?: string }) {
  const { signOut } = useAuth()
  const router = useRouter()
  return (
    <button
      onClick={async () => { await signOut(); router.replace('/'); router.refresh() }}
      aria-label="Αποσύνδεση" title="Αποσύνδεση"
      className={className ??
        'relative z-10 w-9 h-9 rounded-lg bg-chalk/[0.06] grid place-items-center ' +
        'text-silver active:bg-chalk/10'}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  )
}

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
        'text-silver text-base active:bg-chalk/10'}>
      🚪
    </button>
  )
}

'use client'
import { useAuth } from '@/lib/hooks/useAuth'

/** Σύνδεσμος για γραφικό Instagram — ορατός μόνο σε admin. */
export default function GraphicLink({ href, children }: {
  href: string; children: React.ReactNode
}) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return null
  return (
    <a href={href} target="_blank" rel="noopener"
      className="flex items-center justify-center gap-2 mb-4 py-3 rounded-xl
        bg-turf border border-lit/25 text-lit text-[12.5px] font-extrabold
        active:bg-[#1C1C22]">
      {children}
    </a>
  )
}

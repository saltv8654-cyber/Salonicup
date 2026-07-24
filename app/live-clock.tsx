'use client'
import { clockLabel } from '@/lib/clock'
import { useNow } from '@/lib/hooks/useNow'

/** Ζωντανό λεπτό αγώνα (π.χ. 23', 30+2', ΗΜ) — ανανεώνεται μόνο του. */
export default function LiveClock({ period, startedAt, className }: {
  period: string | null
  startedAt: string | null
  className?: string
}) {
  const now = useNow(1000)
  const clk = clockLabel(period, startedAt, now)
  if (!clk) return null
  return <span className={className}>{clk}</span>
}

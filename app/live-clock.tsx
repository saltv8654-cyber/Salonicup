'use client'
import { clockLabel } from '@/lib/clock'
import { useNow } from '@/lib/hooks/useNow'

/** Ζωντανό ρολόι αγώνα σε ΛΕΠΤΑ:ΔΕΥΤ (π.χ. 12:34, ΗΜ, ΤΕΛ) — ανανεώνεται μόνο του. */
export default function LiveClock({ period, startedAt, className }: {
  period: string | null
  startedAt: string | null
  className?: string
  withHalf?: boolean
}) {
  const now = useNow(1000)
  const clk = clockLabel(period, startedAt, now)
  if (!clk) return null
  return <span className={className}>{clk}</span>
}

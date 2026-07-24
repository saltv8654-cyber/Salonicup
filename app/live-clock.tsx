'use client'
import { clockLabel, clockHalf } from '@/lib/clock'
import { useNow } from '@/lib/hooks/useNow'

/** Ζωντανό λεπτό αγώνα (π.χ. 23', 30+2', ΗΜ) — ανανεώνεται μόνο του.
 *  withHalf: προσθέτει και το ημίχρονο (π.χ. «Α΄ · 12΄»). */
export default function LiveClock({ period, startedAt, className, withHalf }: {
  period: string | null
  startedAt: string | null
  className?: string
  withHalf?: boolean
}) {
  const now = useNow(1000)
  const clk = clockLabel(period, startedAt, now)
  if (!clk) return null
  const half = withHalf ? clockHalf(period) : null
  return <span className={className}>{half ? `${half} · ${clk}` : clk}</span>
}

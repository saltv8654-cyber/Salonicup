'use client'
import { useEffect, useRef } from 'react'

/** Οριζόντια μπάρα που, στο mount, κεντράρει το ενεργό στοιχείο ([data-on="1"]). */
export default function ScrollActive({ children, className }: {
  children: React.ReactNode; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = ref.current
    const el = c?.querySelector('[data-on="1"]') as HTMLElement | null
    if (c && el) c.scrollLeft = el.offsetLeft - (c.clientWidth - el.clientWidth) / 2
  }, [])
  return <div ref={ref} className={className}>{children}</div>
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { fmtDay } from '@/lib/time'

type Notice = { id: string; body: string; created_at: string }
const KEY = 'salonicup_seen_notices'

/** Μπάνερ στην κορυφή: αλλαγές στους αγώνες της ομάδας του captain (τελευταίες ~10 μέρες). */
export default function ChangeBanner() {
  const supabase = createClient()
  const { profile } = useAuth()
  const [rows, setRows] = useState<Notice[]>([])
  const [seen, setSeen] = useState<string[]>([])

  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch {}
  }, [])

  useEffect(() => {
    const tid = profile?.team_id
    if (!tid) return
    const since = new Date(Date.now() - 10 * 86400000).toISOString()
    supabase.from('match_notices').select('id, body, created_at')
      .eq('team_id', tid).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setRows(data ?? []))
  }, [profile?.team_id])

  const shown = rows.filter(r => !seen.includes(r.id))
  if (!shown.length) return null

  const dismiss = (id: string) => {
    const next = [...seen, id]
    setSeen(next)
    try { localStorage.setItem(KEY, JSON.stringify(next.slice(-100))) } catch {}
  }
  const dismissAll = () => {
    const next = [...seen, ...shown.map(r => r.id)]
    setSeen(next)
    try { localStorage.setItem(KEY, JSON.stringify(next.slice(-100))) } catch {}
  }

  return (
    <div className="mx-3.5 mb-3 rounded-xl border border-[#E0563C]/40 bg-[#E0563C]/[0.08] overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-[#E0563C]/20">
        <span>📅</span>
        <span className="flex-1 text-[12px] font-extrabold text-[#ff9a86]">Αλλαγές στους αγώνες σου</span>
        <button onClick={dismissAll} className="text-[10px] font-bold text-dim">Καθαρισμός</button>
      </div>
      <div className="flex flex-col">
        {shown.map((r, i) => (
          <div key={r.id} className={`flex items-start gap-2 px-3.5 py-2 ${i ? 'border-t border-[#E0563C]/12' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-chalk leading-snug">{r.body}</p>
              <p className="text-[9px] text-off mt-0.5">{fmtDay(r.created_at)}</p>
            </div>
            <button onClick={() => dismiss(r.id)}
              className="shrink-0 w-6 h-6 rounded-lg bg-chalk/[0.06] text-silver text-xs grid place-items-center">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

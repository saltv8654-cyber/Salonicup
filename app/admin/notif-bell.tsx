'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Notif = { id: string; kind: string; title: string; body: string | null; url: string | null; read: boolean; created_at: string }

const ICON: Record<string, string> = { response: '⚽', signup: '🙋', default: '🔔' }

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'μόλις τώρα'
  const m = Math.floor(s / 60); if (m < 60) return `${m}′`
  const h = Math.floor(m / 60); if (h < 24) return `${h} ώρ.`
  const d = Math.floor(h / 24); if (d < 7) return `${d} ημ.`
  return new Date(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
}

export default function NotifBell() {
  const router = useRouter()
  const [items, setItems] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const unread = items.filter(n => !n.read).length

  const load = () => {
    const supabase = createClient()
    supabase.from('admin_notifications')
      .select('id, kind, title, body, url, read, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { if (data) setItems(data as Notif[]) })
  }

  useEffect(() => {
    load()
    const supabase = createClient()
    const ch = supabase.channel('admin-notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload: any) => setItems(prev => [payload.new as Notif, ...prev].slice(0, 30)))
      .subscribe()
    const iv = setInterval(load, 45000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [])

  // Κλείσιμο με πάτημα εκτός
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const openPanel = async () => {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen && unread > 0) {
      setItems(prev => prev.map(n => ({ ...n, read: true })))  // αισιόδοξο UI
      const supabase = createClient()
      await supabase.from('admin_notifications').update({ read: true }).eq('read', false)
    }
  }

  const go = (n: Notif) => { setOpen(false); if (n.url) router.push(n.url) }

  return (
    <div ref={wrap} className="relative">
      <button onClick={openPanel} aria-label="Ειδοποιήσεις"
        className="relative w-9 h-9 rounded-lg bg-turf border border-chalk/[0.06]
          grid place-items-center text-[17px] active:bg-[#1C1C22]">
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full
            bg-danger text-white text-[9px] font-black grid place-items-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[300px] max-h-[70vh] overflow-y-auto
          bg-turf border border-chalk/[0.1] rounded-xl shadow-2xl z-50">
          <div className="px-3.5 py-2.5 border-b border-chalk/[0.06] flex items-center justify-between sticky top-0 bg-turf">
            <span className="text-[12px] font-extrabold text-chalk">Ειδοποιήσεις</span>
          </div>
          {items.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[12px] text-dim">Καμία ειδοποίηση.</p>
          ) : items.map(n => (
            <button key={n.id} onClick={() => go(n)}
              className="w-full text-left px-3.5 py-2.5 border-b border-chalk/[0.04]
                flex gap-2.5 active:bg-[#1C1C22]">
              <span className="text-[15px] shrink-0 mt-0.5">{ICON[n.kind] ?? ICON.default}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-chalk leading-snug">{n.title}</p>
                {n.body && <p className="text-[11px] text-silver leading-snug truncate">{n.body}</p>}
                <p className="text-[9.5px] text-dim mt-0.5">{ago(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

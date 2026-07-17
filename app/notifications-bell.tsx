'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { enablePush, pushState, pushSupported, type PushState } from '@/lib/push'

export default function NotificationsBell() {
  const [state, setState] = useState<PushState>('default')
  const [busy, setBusy]   = useState(false)

  useEffect(() => { setState(pushState()) }, [])

  if (!pushSupported()) return null

  async function toggle() {
    if (state === 'granted') {
      // Δοκιμαστική ειδοποίηση + διάγνωση
      const r = await fetch('/api/push/test', { method: 'POST' }).then(x => x.json()).catch(() => null)
      if (!r) return toast.error('Σφάλμα δικτύου')
      if (r.ok) {
        toast.success(`Στάλθηκε δοκιμή σε ${r.sent}/${r.subs} συσκευές`)
      } else if (r.reason === 'env-missing') {
        toast.error('Λείπουν κλειδιά στο Vercel: ' + (r.missing || []).join(', '))
      } else if (r.reason === 'no-subscriptions') {
        toast.error('Καμία εγγεγραμμένη συσκευή — πάτα ξανά «Επιτρέπω»')
      } else {
        toast.error('Πρόβλημα: ' + (r.reason || r.error || '?'))
      }
      return
    }
    if (state === 'denied') {
      toast.error('Οι ειδοποιήσεις είναι μπλοκαρισμένες — ενεργοποίησέ τες απ\' τις ρυθμίσεις του browser')
      return
    }
    setBusy(true)
    try {
      await enablePush()
      setState('granted')
      toast.success('Ειδοποιήσεις ενεργές! ⚽')
    } catch (e: any) {
      toast.error(e?.message ?? 'Δεν ενεργοποιήθηκαν')
      setState(pushState())
    } finally {
      setBusy(false)
    }
  }

  const on = state === 'granted'
  return (
    <button onClick={toggle} disabled={busy}
      aria-label="Ειδοποιήσεις"
      className={`relative z-10 flex items-center gap-1.5 px-3 py-2 rounded-full
        text-[11px] font-extrabold border transition-colors disabled:opacity-50
        ${on ? 'bg-lit/[0.14] text-lit border-lit/30'
             : 'bg-turf text-silver border-chalk/[0.08]'}`}>
      <span className="text-sm">{on ? '🔔' : '🔕'}</span>
      {on ? 'Ενεργές' : 'Ειδοποιήσεις'}
    </button>
  )
}

'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { enablePush, disablePush, pushState, pushSupported, type PushState } from '@/lib/push'

export default function NotificationsBell() {
  const [state, setState]         = useState<PushState>('default')
  const [supported, setSupported] = useState(true)
  const [busy, setBusy]           = useState(false)

  useEffect(() => {
    const sup = pushSupported()
    setSupported(sup)
    const perm = pushState()
    setState(perm)
    // «Ενεργές» μόνο αν υπάρχει και ενεργή συνδρομή σε αυτή τη συσκευή
    if (sup && perm === 'granted') {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => { if (!sub) setState('default') })
        .catch(() => {})
    }
  }, [])

  async function toggle() {
    // Μη υποστηριζόμενο (π.χ. iPhone Safari χωρίς εγκατάσταση)
    if (!supported) {
      const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      toast(iOS
        ? 'Για ειδοποιήσεις: Κοινή χρήση ↑ → «Προσθήκη στην αρχική οθόνη», μετά άνοιξέ την από εκεί.'
        : 'Ο browser σου δεν υποστηρίζει ειδοποιήσεις.',
        { duration: 6000, icon: '📲' })
      return
    }
    if (state === 'denied') {
      toast.error('Μπλοκαρισμένες — ενεργοποίησέ τες απ\' τις Ρυθμίσεις iPhone → Salonicup')
      return
    }

    // Ήδη ενεργές → απενεργοποίηση
    if (state === 'granted') {
      setBusy(true)
      try {
        await disablePush()
        setState('default')
        toast('Ειδοποιήσεις ανενεργές 🔕', { icon: '🔕' })
      } catch (e: any) {
        toast.error(e?.message ?? 'Δεν απενεργοποιήθηκαν')
      } finally {
        setBusy(false)
      }
      return
    }

    // Αλλιώς → ενεργοποίηση
    setBusy(true)
    try {
      // Πάντα ξανα-εξασφαλίζει άδεια + εγγραφή + αποθήκευση (idempotent)
      await enablePush()
      setState('granted')
      // Αμέσως μετά, δοκιμαστική ειδοποίηση + διάγνωση
      const r = await fetch('/api/push/test', { method: 'POST' }).then(x => x.json()).catch(() => null)
      if (r?.ok) {
        toast.success(`Ενεργές! Δοκιμή σε ${r.sent}/${r.subs} συσκευές 📲`)
      } else if (r?.reason === 'env-missing') {
        toast.error('Λείπουν κλειδιά: ' + (r.missing || []).join(', '))
      } else if (r?.reason === 'no-subscriptions') {
        toast.error('Η εγγραφή δεν σώθηκε — ξαναπάτησέ το')
      } else {
        toast.success('Ειδοποιήσεις ενεργές ⚽')
      }
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

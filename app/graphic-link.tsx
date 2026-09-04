'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { saveImageBlob } from '@/app/admin/post/versus-card'
import toast from 'react-hot-toast'

/** Γραφικό Instagram — κατεβάζει/αποθηκεύει την εικόνα (→ Φωτογραφίες σε iPhone). Μόνο admin. */
export default function GraphicLink({ href, children }: {
  href: string; children: React.ReactNode
}) {
  const { isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!isAdmin) return null

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(href)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const r = await saveImageBlob(blob, `salonicup-${Date.now()}.png`)
      if (r === 'shared') toast.success('Αποθήκευσέ το στις Φωτογραφίες')
      else if (r === 'downloaded') toast.success('Κατέβηκε')
    } catch {
      // fallback: άνοιγμα σε καρτέλα (π.χ. αν αποτύχει το fetch)
      window.open(href, '_blank', 'noopener')
    } finally { setBusy(false) }
  }

  return (
    <button onClick={save} disabled={busy}
      className="w-full flex items-center justify-center gap-2 mb-4 py-3 rounded-xl
        bg-turf border border-lit/25 text-lit text-[12.5px] font-extrabold
        active:bg-[#1C1C22] disabled:opacity-60">
      {busy ? '⏳ Δημιουργία…' : children}
    </button>
  )
}

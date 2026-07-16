'use client'
import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

/* ── Ανέβασμα σήματος (ομάδα/πρωτάθλημα) από το άλμπουμ ── */
export function LogoUpload({ bucket, url, onChange, fallback = '🏆', label = 'ΣΗΜΑ' }: {
  bucket: string; url: string; onChange: (url: string) => void
  fallback?: string; label?: string
}) {
  const supabase = createClient()
  const [up, setUp] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setUp(true)
    try {
      const ext  = file.name.split('.').pop() || 'png'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error } = await supabase.storage.from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
      onChange(publicUrl)
      toast.success('Σήμα ανέβηκε')
    } catch (e: any) {
      toast.error(e.message ?? 'Δεν ανέβηκε')
    } finally { setUp(false) }
  }

  return (
    <div>
      <label className="block text-[8.5px] font-extrabold text-dim
        tracking-[0.12em] mb-1.5 pl-0.5">{label}</label>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-xl bg-chalk/[0.04] overflow-hidden
            border border-chalk/[0.07] grid place-items-center">
            {url
              ? <img src={url} alt="" className="w-full h-full object-contain" />
              : <span className="text-2xl">{fallback}</span>}
          </div>
          {up && (
            <div className="absolute inset-0 rounded-xl bg-black/60 grid place-items-center">
              <div className="spinner" />
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-3.5 py-2.5 rounded-xl bg-chalk/[0.05] text-silver
              text-[12px] font-bold">📷 Επίλεξε από άλμπουμ</button>
          {url && (
            <button type="button" onClick={() => onChange('')}
              className="px-3.5 py-2 rounded-xl bg-danger/15 text-danger
                text-[11px] font-bold">Αφαίρεση</button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
    </div>
  )
}

/* ── Κοινά admin components ── */
export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative bg-turf rounded-t-[20px] max-h-[88vh] flex flex-col
        border-t-2 border-brand">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0
          border-b border-chalk/[0.06]">
          <h3 className="text-base font-extrabold text-chalk">{title}</h3>
          <button onClick={onClose}
            className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06]
              grid place-items-center text-silver text-sm">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Field({ label, value, onChange, placeholder, numeric }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; numeric?: boolean
}) {
  return (
    <div>
      <label className="block text-[8.5px] font-extrabold text-dim
        tracking-[0.12em] mb-1.5 pl-0.5">{label}</label>
      <input
        value={value}
        onChange={e => onChange(numeric
          ? e.target.value.replace(/\D/g, '')
          : e.target.value)}
        inputMode={numeric ? 'numeric' : 'text'}
        placeholder={placeholder}
        className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
          outline-none border border-chalk/[0.07] focus:border-lit/50
          placeholder:text-off"
      />
    </div>
  )
}

export function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-[8.5px] font-extrabold text-dim
        tracking-[0.12em] mb-1.5 pl-0.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
          outline-none border border-chalk/[0.07] focus:border-lit/50">
        <option value="">— Επίλεξε —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function SaveBtn({ busy, onClick, label = 'Αποθήκευση' }: {
  busy: boolean; onClick: () => void; label?: string
}) {
  return (
    <button onClick={onClick} disabled={busy}
      className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
        text-white font-extrabold text-[15px] mt-2 disabled:opacity-50
        shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
      {busy ? 'Αποθήκευση…' : label}
    </button>
  )
}

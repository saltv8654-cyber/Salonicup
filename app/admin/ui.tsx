'use client'

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

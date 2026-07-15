'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty } from '@/app/ui'
import { Modal, Field, SaveBtn } from '../ui'
import toast from 'react-hot-toast'
import type { Venue } from '@/lib/types'

export default function AdminVenues() {
  const supabase = createClient()
  const [rows, setRows] = useState<Venue[]>([])
  const [load, setLoad] = useState(true)
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Venue | null>(null)

  async function fetchRows() {
    const { data } = await supabase.from('venues').select('*').order('name')
    setRows(data ?? [])
    setLoad(false)
  }

  useEffect(() => { fetchRows() }, [])

  async function remove(id: string) {
    if (!confirm('Διαγραφή γηπέδου;')) return
    const { error } = await supabase.from('venues').delete().eq('venue_id', id)
    if (error) return toast.error('Δεν διαγράφηκε')
    toast.success('Διαγράφηκε'); fetchRows()
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold text-chalk">Γήπεδα</h1>
        <button onClick={() => { setEdit(null); setOpen(true) }}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand
            text-white text-[12.5px] font-extrabold">+ Νέο</button>
      </div>

      {!rows.length ? <Empty>Δεν υπάρχουν γήπεδα.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {rows.map(v => (
            <div key={v.venue_id}
              className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                border border-chalk/[0.05]">
              <span className="text-2xl">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-chalk truncate">{v.name}</p>
                <p className="text-[10.5px] text-dim mt-0.5">
                  {v.fields?.length ? v.fields.join(' · ') : 'χωρίς γήπεδα'}
                </p>
              </div>
              <button onClick={() => { setEdit(v); setOpen(true) }}
                className="px-3 py-2 rounded-lg bg-chalk/[0.05] text-silver
                  text-[11px] font-bold">Επεξ.</button>
              <button onClick={() => remove(v.venue_id)}
                className="px-2.5 py-2 rounded-lg bg-danger/15 text-danger
                  text-[11px] font-bold">✕</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <VenueForm row={edit}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchRows() }} />
      )}
    </div>
  )
}

function VenueForm({ row, onClose, onSaved }: {
  row: Venue | null; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName]     = useState(row?.name ?? '')
  const [fields, setFields] = useState((row?.fields ?? []).join(', '))
  const [busy, setBusy]     = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Χρειάζεται όνομα')
    setBusy(true)
    const arr = fields.split(',').map(f => f.trim()).filter(Boolean)
    const payload = { name: name.trim(), fields: arr }
    const { error } = row
      ? await supabase.from('venues').update(payload).eq('venue_id', row.venue_id)
      : await supabase.from('venues').insert(payload)

    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Αποθηκεύτηκε'); onSaved()
  }

  return (
    <Modal title={row ? 'Επεξεργασία γηπέδου' : 'Νέο γήπεδο'} onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Νικοκούδη" />
      <Field label="ΓΗΠΕΔΑ (χωρισμένα με κόμμα)" value={fields} onChange={setFields}
        placeholder="Γήπ. 3, Γήπ. 4" />
      <p className="text-[10.5px] text-dim -mt-1">
        π.χ. «Γήπ. 3, Γήπ. 4» — κάθε γήπεδο γίνεται ξεχωριστό slot στο πρόγραμμα.
      </p>
      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

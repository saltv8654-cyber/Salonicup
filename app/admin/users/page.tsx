'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty } from '@/app/ui'
import { Modal, Field, Select, SaveBtn } from '../ui'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'

const ROLES = [
  { value: 'admin',   label: 'Διαχειριστής' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'captain', label: 'Αρχηγός' },
  { value: 'viewer',  label: 'Θεατής' },
]

export default function AdminUsers() {
  const supabase = createClient()
  const [rows, setRows] = useState<Profile[]>([])
  const [load, setLoad] = useState(true)
  const [open, setOpen] = useState(false)

  async function fetchRows() {
    const { data } = await supabase.from('profiles')
      .select('*').order('role')
    setRows(data ?? [])
    setLoad(false)
  }

  useEffect(() => { fetchRows() }, [])

  async function changeRole(id: string, role: string) {
    const { error } = await supabase.from('profiles')
      .update({ role }).eq('id', id)
    if (error) return toast.error('Δεν άλλαξε')
    toast.success('Ενημερώθηκε'); fetchRows()
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold text-chalk">Χρήστες</h1>
        <button onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand
            text-white text-[12.5px] font-extrabold">+ Speaker</button>
      </div>

      {!rows.length ? <Empty>Δεν υπάρχουν χρήστες.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {rows.map(u => (
            <div key={u.id}
              className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                border border-chalk/[0.05]">
              <div className="w-9 h-9 rounded-full bg-brand/[0.18] grid place-items-center
                text-sm font-extrabold text-lit">
                {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-chalk truncate">
                  {u.full_name || u.email}
                </p>
                <p className="text-[10.5px] text-dim truncate">{u.email}</p>
              </div>
              <select value={u.role}
                onChange={e => changeRole(u.id, e.target.value)}
                className="bg-chalk/[0.05] rounded-lg px-2.5 py-2 text-silver
                  text-[11px] font-bold outline-none border border-chalk/[0.06]">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {open && (
        <UserForm onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchRows() }} />
      )}
    </div>
  )
}

function UserForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [role, setRole]   = useState('speaker')
  const [busy, setBusy]   = useState(false)

  async function save() {
    if (!email.trim() || !pass.trim()) return toast.error('Λείπει email ή κωδικός')
    if (pass.length < 6) return toast.error('Κωδικός τουλάχιστον 6 χαρακτήρες')
    setBusy(true)

    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(), password: pass, full_name: name.trim(), role,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Ο χρήστης δημιουργήθηκε')
      onSaved()
    } catch (e: any) {
      toast.error(e.message ?? 'Δεν δημιουργήθηκε')
    } finally { setBusy(false) }
  }

  return (
    <Modal title="Νέος χρήστης" onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Γιώργος Π." />
      <Field label="EMAIL" value={email} onChange={setEmail} placeholder="speaker@salonicup.gr" />
      <Field label="ΚΩΔΙΚΟΣ" value={pass} onChange={setPass} placeholder="min. 6 χαρακτήρες" />
      <Select label="ΡΟΛΟΣ" value={role} onChange={setRole} options={ROLES} />
      <SaveBtn busy={busy} onClick={save} label="Δημιουργία" />
    </Modal>
  )
}

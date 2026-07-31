'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Modal, Field, SaveBtn } from '../ui'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'

/** Κατηγορίες προσωπικού — κάθε μία αντιστοιχεί σε έναν ρόλο χρήστη. */
const SECTIONS = [
  { role: 'speaker',      title: 'Speaker',      icon: '🎙', accent: '#FF7A2F' },
  { role: 'referee',      title: 'Referees',     icon: '🟨', accent: '#F2C230' },
  { role: 'photographer', title: 'Φωτογράφοι',   icon: '📷', accent: '#3aa0ff' },
  { role: 'social',       title: 'Social Media', icon: '📱', accent: '#e0176b' },
] as const

const MOVE = [
  { value: 'speaker',      label: '🎙 Speaker' },
  { value: 'referee',      label: '🟨 Referee' },
  { value: 'photographer', label: '📷 Φωτογράφος' },
  { value: 'social',       label: '📱 Social Media' },
  { value: 'viewer',       label: '— Αφαίρεση —' },
]

export default function AdminStaff() {
  const supabase = createClient()
  const [rows, setRows] = useState<Profile[]>([])
  const [load, setLoad] = useState(true)
  const [addRole, setAddRole] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function fetchRows() {
    const { data } = await supabase.from('profiles')
      .select('id, full_name, email, role, team_id').order('full_name')
    setRows(data ?? [])
    setLoad(false)
  }
  useEffect(() => { fetchRows() }, [])

  async function changeRole(id: string, role: string) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) return toast.error('Δεν άλλαξε')
    toast.success('Ενημερώθηκε'); fetchRows()
  }

  async function saveName(id: string) {
    const name = editName.trim()
    const { error } = await supabase.from('profiles')
      .update({ full_name: name || null }).eq('id', id)
    setEditId(null)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Ενημερώθηκε'); fetchRows()
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-4">Προσωπικό</h1>

      <div className="flex flex-col gap-5">
        {SECTIONS.map(sec => {
          const people = rows.filter(u => u.role === sec.role)
          return (
            <div key={sec.role}>
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <span className="text-base">{sec.icon}</span>
                <span className="text-[13.5px] font-extrabold" style={{ color: sec.accent }}>
                  {sec.title}
                </span>
                <span className="text-[10px] text-dim font-bold tnum">{people.length}</span>
                <button onClick={() => setAddRole(sec.role)}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-chalk/[0.06] border border-chalk/[0.08]
                    text-[11px] font-extrabold text-silver active:bg-chalk/10">
                  + Προσθήκη
                </button>
              </div>

              {people.length === 0 ? (
                <div className="bg-turf/50 rounded-xl border border-dashed border-chalk/[0.08]
                  px-3.5 py-4 text-center text-[11.5px] text-off">
                  Κανένας ακόμη
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {people.map(u => (
                    <div key={u.id}
                      className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                        border border-chalk/[0.05]">
                      <div className="w-9 h-9 rounded-full grid place-items-center text-sm font-extrabold shrink-0"
                        style={{ background: `${sec.accent}22`, color: sec.accent }}>
                        {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        {editId === u.id ? (
                          <input autoFocus value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onBlur={() => saveName(u.id)}
                            onKeyDown={e => { if (e.key === 'Enter') saveName(u.id); if (e.key === 'Escape') setEditId(null) }}
                            placeholder="Εμφανιζόμενο όνομα"
                            className="w-full bg-chalk/[0.06] rounded-lg px-2.5 py-1.5 text-chalk text-[13px]
                              font-bold outline-none border border-lit/50" />
                        ) : (
                          <button onClick={() => { setEditId(u.id); setEditName(u.full_name ?? '') }}
                            className="flex items-center gap-1.5 max-w-full active:opacity-70">
                            <span className="text-[13px] font-bold text-chalk truncate">
                              {u.full_name || u.email}
                            </span>
                            <span className="text-dim text-[10px] shrink-0">✎</span>
                          </button>
                        )}
                        <p className="text-[10.5px] text-dim truncate">{u.email}</p>
                      </div>
                      <select value={u.role}
                        onChange={e => changeRole(u.id, e.target.value)}
                        className="bg-chalk/[0.05] rounded-lg px-2 py-2 text-silver text-[11px]
                          font-bold outline-none border border-chalk/[0.06] shrink-0">
                        {MOVE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {addRole && (
        <StaffForm role={addRole}
          title={SECTIONS.find(s => s.role === addRole)?.title ?? ''}
          onClose={() => setAddRole(null)}
          onSaved={() => { setAddRole(null); fetchRows() }} />
      )}
    </div>
  )
}

function StaffForm({ role, title, onClose, onSaved }: {
  role: string; title: string; onClose: () => void; onSaved: () => void
}) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [busy, setBusy]   = useState(false)

  async function save() {
    if (!email.trim() || !pass.trim()) return toast.error('Λείπει email ή κωδικός')
    if (pass.length < 6) return toast.error('Κωδικός τουλάχιστον 6 χαρακτήρες')
    setBusy(true)
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: pass, full_name: name.trim(), role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Προστέθηκε')
      onSaved()
    } catch (e: any) {
      toast.error(e.message ?? 'Δεν δημιουργήθηκε')
    } finally { setBusy(false) }
  }

  return (
    <Modal title={`Νέος · ${title}`} onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Γιώργος Παπαδόπουλος" />
      <Field label="EMAIL" value={email} onChange={setEmail} placeholder="name@salonicup.gr" />
      <Field label="ΚΩΔΙΚΟΣ" value={pass} onChange={setPass} placeholder="min. 6 χαρακτήρες" />
      <SaveBtn busy={busy} onClick={save} label="Δημιουργία" />
    </Modal>
  )
}

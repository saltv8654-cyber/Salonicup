'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Modal, Field, SaveBtn } from '../ui'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'

type StaffKind = 'referee' | 'photographer' | 'social'
type Staff = { id: string; name: string; kind: StaffKind }

/** Οι 3 κατηγορίες «χωρίς λογαριασμό» — μόνο όνομα (πίνακας staff). */
const KINDS = [
  { kind: 'referee'      as StaffKind, title: 'Referees',     icon: '🟨', accent: '#F2C230' },
  { kind: 'photographer' as StaffKind, title: 'Φωτογράφοι',   icon: '📷', accent: '#3aa0ff' },
  { kind: 'social'       as StaffKind, title: 'Social Media', icon: '📱', accent: '#e0176b' },
]
const KIND_MOVE = [
  { value: 'referee',      label: '🟨 Referee' },
  { value: 'photographer', label: '📷 Φωτογράφος' },
  { value: 'social',       label: '📱 Social Media' },
  { value: '__del',        label: '🗑 Διαγραφή' },
]

export default function AdminStaff() {
  const supabase = createClient()
  const [speakers, setSpeakers] = useState<Profile[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [load, setLoad] = useState(true)
  const [addSpeaker, setAddSpeaker] = useState(false)
  const [addKind, setAddKind] = useState<StaffKind | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function fetchAll() {
    const [p, s] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, team_id')
        .eq('role', 'speaker').order('full_name'),
      supabase.from('staff').select('id, name, kind').order('name'),
    ])
    setSpeakers(p.data ?? [])
    setStaff(s.data ?? [])
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [])

  // ── Speaker (auth χρήστες) ──
  async function removeSpeaker(id: string) {
    const { error } = await supabase.from('profiles').update({ role: 'viewer' }).eq('id', id)
    if (error) return toast.error('Δεν άλλαξε')
    toast.success('Αφαιρέθηκε'); fetchAll()
  }
  async function saveSpeakerName(id: string) {
    const { error } = await supabase.from('profiles')
      .update({ full_name: editName.trim() || null }).eq('id', id)
    setEditId(null)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Ενημερώθηκε'); fetchAll()
  }

  // ── Staff (χωρίς λογαριασμό) ──
  async function moveStaff(id: string, val: string) {
    if (val === '__del') {
      const { error } = await supabase.from('staff').delete().eq('id', id)
      if (error) return toast.error('Δεν διαγράφηκε')
      toast.success('Διαγράφηκε'); return fetchAll()
    }
    const { error } = await supabase.from('staff').update({ kind: val }).eq('id', id)
    if (error) return toast.error('Δεν άλλαξε')
    toast.success('Ενημερώθηκε'); fetchAll()
  }
  async function saveStaffName(id: string) {
    const name = editName.trim()
    if (!name) { setEditId(null); return }
    const { error } = await supabase.from('staff').update({ name }).eq('id', id)
    setEditId(null)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Ενημερώθηκε'); fetchAll()
  }

  if (load) return <Loading />

  const Avatar = ({ ch, accent }: { ch: string; accent: string }) => (
    <div className="w-9 h-9 rounded-full grid place-items-center text-sm font-extrabold shrink-0"
      style={{ background: `${accent}22`, color: accent }}>{ch.toUpperCase()}</div>
  )
  const NameCell = ({ id, current, onSave }: {
    id: string; current: string; onSave: (id: string) => void
  }) => editId === id ? (
    <input autoFocus value={editName}
      onChange={e => setEditName(e.target.value)}
      onBlur={() => onSave(id)}
      onKeyDown={e => { if (e.key === 'Enter') onSave(id); if (e.key === 'Escape') setEditId(null) }}
      placeholder="Όνομα"
      className="w-full bg-chalk/[0.06] rounded-lg px-2.5 py-1.5 text-chalk text-[13px]
        font-bold outline-none border border-lit/50" />
  ) : (
    <button onClick={() => { setEditId(id); setEditName(current) }}
      className="flex items-center gap-1.5 max-w-full active:opacity-70">
      <span className="text-[13px] font-bold text-chalk truncate">{current}</span>
      <span className="text-dim text-[10px] shrink-0">✎</span>
    </button>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-4">Προσωπικό</h1>

      <div className="flex flex-col gap-5">
        {/* ── Speaker: με λογαριασμό (συνδέονται στο panel) ── */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-0.5">
            <span className="text-base">🎙</span>
            <span className="text-[13.5px] font-extrabold text-lit">Speaker</span>
            <span className="text-[10px] text-dim font-bold tnum">{speakers.length}</span>
            <button onClick={() => setAddSpeaker(true)}
              className="ml-auto px-3 py-1.5 rounded-lg bg-chalk/[0.06] border border-chalk/[0.08]
                text-[11px] font-extrabold text-silver active:bg-chalk/10">+ Προσθήκη</button>
          </div>
          <p className="text-[10px] text-off mb-2 px-0.5">Έχουν λογαριασμό & συνδέονται στο panel του σπίκερ.</p>
          {speakers.length === 0 ? (
            <div className="bg-turf/50 rounded-xl border border-dashed border-chalk/[0.08]
              px-3.5 py-4 text-center text-[11.5px] text-off">Κανένας ακόμη</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {speakers.map(u => (
                <div key={u.id} className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                  border border-chalk/[0.05]">
                  <Avatar ch={(u.full_name || u.email || '?').charAt(0)} accent="#FF7A2F" />
                  <div className="flex-1 min-w-0">
                    <NameCell id={u.id} current={u.full_name || u.email || ''} onSave={saveSpeakerName} />
                    <p className="text-[10.5px] text-dim truncate">{u.email}</p>
                  </div>
                  <button onClick={() => removeSpeaker(u.id)}
                    className="shrink-0 px-2.5 py-2 rounded-lg bg-chalk/[0.05] border border-chalk/[0.06]
                      text-dim text-[11px] font-bold active:bg-chalk/10">Αφαίρεση</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Referees / Φωτογράφοι / Social: μόνο όνομα ── */}
        {KINDS.map(sec => {
          const people = staff.filter(s => s.kind === sec.kind)
          return (
            <div key={sec.kind}>
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <span className="text-base">{sec.icon}</span>
                <span className="text-[13.5px] font-extrabold" style={{ color: sec.accent }}>{sec.title}</span>
                <span className="text-[10px] text-dim font-bold tnum">{people.length}</span>
                <button onClick={() => setAddKind(sec.kind)}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-chalk/[0.06] border border-chalk/[0.08]
                    text-[11px] font-extrabold text-silver active:bg-chalk/10">+ Προσθήκη</button>
              </div>
              {people.length === 0 ? (
                <div className="bg-turf/50 rounded-xl border border-dashed border-chalk/[0.08]
                  px-3.5 py-4 text-center text-[11.5px] text-off">Κανένας ακόμη</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {people.map(s => (
                    <div key={s.id} className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                      border border-chalk/[0.05]">
                      <Avatar ch={(s.name || '?').charAt(0)} accent={sec.accent} />
                      <div className="flex-1 min-w-0">
                        <NameCell id={s.id} current={s.name} onSave={saveStaffName} />
                      </div>
                      <select value={s.kind} onChange={e => moveStaff(s.id, e.target.value)}
                        className="bg-chalk/[0.05] rounded-lg px-2 py-2 text-silver text-[11px]
                          font-bold outline-none border border-chalk/[0.06] shrink-0">
                        {KIND_MOVE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {addSpeaker && (
        <SpeakerForm onClose={() => setAddSpeaker(false)}
          onSaved={() => { setAddSpeaker(false); fetchAll() }} />
      )}
      {addKind && (
        <NameForm kind={addKind}
          title={KINDS.find(k => k.kind === addKind)?.title ?? ''}
          onClose={() => setAddKind(null)}
          onSaved={() => { setAddKind(null); fetchAll() }} />
      )}
    </div>
  )
}

/** Speaker → auth χρήστης (email + κωδικός). */
function SpeakerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
        body: JSON.stringify({ email: email.trim(), password: pass, full_name: name.trim(), role: 'speaker' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Προστέθηκε'); onSaved()
    } catch (e: any) {
      toast.error(e.message ?? 'Δεν δημιουργήθηκε')
    } finally { setBusy(false) }
  }

  return (
    <Modal title="Νέος · Speaker" onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Γιώργος Παπαδόπουλος" />
      <Field label="EMAIL" value={email} onChange={setEmail} placeholder="name@salonicup.gr" />
      <Field label="ΚΩΔΙΚΟΣ" value={pass} onChange={setPass} placeholder="min. 6 χαρακτήρες" />
      <SaveBtn busy={busy} onClick={save} label="Δημιουργία" />
    </Modal>
  )
}

/** Referee / Φωτογράφος / Social → μόνο όνομα (πίνακας staff). */
function NameForm({ kind, title, onClose, onSaved }: {
  kind: StaffKind; title: string; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Γράψε όνομα')
    setBusy(true)
    const { error } = await supabase.from('staff').insert({ name: name.trim(), kind })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Προστέθηκε'); onSaved()
  }

  return (
    <Modal title={`Νέος · ${title}`} onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Ονοματεπώνυμο" />
      <SaveBtn busy={busy} onClick={save} label="Προσθήκη" />
    </Modal>
  )
}

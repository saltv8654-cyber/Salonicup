'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Modal, Field, SaveBtn, Select } from '../ui'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'

type StaffKind = 'referee' | 'photographer' | 'social'
type Staff = { id: string; name: string; kind: StaffKind }

const KINDS = [
  { kind: 'referee'      as StaffKind, title: 'Referees',     icon: '🟨', accent: '#F2C230' },
  { kind: 'photographer' as StaffKind, title: 'Φωτογράφοι',   icon: '📷', accent: '#3aa0ff' },
  { kind: 'social'       as StaffKind, title: 'Social Media', icon: '📱', accent: '#e0176b' },
]

export default function AdminStaff() {
  const supabase = createClient()
  const [speakers, setSpeakers] = useState<Profile[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [load, setLoad] = useState(true)
  const [addSpeaker, setAddSpeaker] = useState(false)
  const [addKind, setAddKind] = useState<StaffKind | null>(null)

  async function fetchAll() {
    const [p, s] = await Promise.all([
      // Speakers ΚΑΙ admins — ώστε να μπορείς να καταχωρείς πληρωμές/έξοδα και σε admin
      supabase.from('profiles').select('id, full_name, email, role, team_id')
        .in('role', ['speaker', 'admin']).order('full_name'),
      supabase.from('staff').select('id, name, kind').order('name'),
    ])
    setSpeakers(p.data ?? [])
    setStaff(s.data ?? [])
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [])

  if (load) return <Loading />

  const Avatar = ({ ch, accent }: { ch: string; accent: string }) => (
    <div className="w-9 h-9 rounded-full grid place-items-center text-sm font-extrabold shrink-0"
      style={{ background: `${accent}22`, color: accent }}>{ch.toUpperCase()}</div>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-4">Προσωπικό</h1>

      <div className="flex flex-col gap-5">
        {/* ── Speaker ── */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-0.5">
            <span className="text-base">🎙</span>
            <span className="text-[13.5px] font-extrabold text-lit">Speaker / Admin</span>
            <span className="text-[10px] text-dim font-bold tnum">{speakers.length}</span>
            <button onClick={() => setAddSpeaker(true)}
              className="ml-auto px-3 py-1.5 rounded-lg bg-chalk/[0.06] border border-chalk/[0.08]
                text-[11px] font-extrabold text-silver active:bg-chalk/10">+ Προσθήκη</button>
          </div>
          {speakers.length === 0 ? (
            <div className="bg-turf/50 rounded-xl border border-dashed border-chalk/[0.08]
              px-3.5 py-4 text-center text-[11.5px] text-off">Κανένας ακόμη</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {speakers.map(u => (
                <Link key={u.id} href={`/admin/staff/speaker/${u.id}`}
                  className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                    border border-chalk/[0.05] active:bg-[#1C1C22]">
                  <Avatar ch={(u.full_name || u.email || '?').charAt(0)} accent={u.role === 'admin' ? '#E8B923' : '#FF7A2F'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-chalk truncate">{u.full_name || u.email}</p>
                    <p className="text-[10.5px] text-dim truncate">{u.email}</p>
                  </div>
                  {u.role === 'admin' && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-extrabold
                      bg-[#E8B923]/15 text-[#E8B923] border border-[#E8B923]/30">ADMIN</span>
                  )}
                  <span className="text-dim text-[13px] shrink-0">›</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Referees / Φωτογράφοι / Social ── */}
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
              {sec.kind !== 'referee' && (
                <p className="text-[10px] text-off mb-2 px-0.5">
                  Ανατίθεται ανά μέρα (καλύπτει όλα τα ματς της μέρας) — από το «Πρόγραμμα».
                </p>
              )}
              {people.length === 0 ? (
                <div className="bg-turf/50 rounded-xl border border-dashed border-chalk/[0.08]
                  px-3.5 py-4 text-center text-[11.5px] text-off">Κανένας ακόμη</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {people.map(s => (
                    <Link key={s.id} href={`/admin/staff/member/${s.id}`}
                      className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                        border border-chalk/[0.05] active:bg-[#1C1C22]">
                      <Avatar ch={(s.name || '?').charAt(0)} accent={sec.accent} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-chalk truncate">{s.name}</p>
                      </div>
                      <span className="text-dim text-[13px] shrink-0">›</span>
                    </Link>
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

/** Speaker → είτε επιλογή υπάρχοντα χρήστη (π.χ. admin) είτε νέος auth χρήστης. */
function SpeakerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [mode, setMode]   = useState<'existing' | 'new'>('existing')
  // Υπάρχων χρήστης
  const [users, setUsers] = useState<Profile[]>([])
  const [pick, setPick]   = useState('')
  // Νέος λογαριασμός
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [busy, setBusy]   = useState(false)

  // Χρήστες που δεν είναι ήδη speakers (admins/captains/viewers) — για «τράβηγμα» ως σπίκερ
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email, role, team_id')
      .in('role', ['admin', 'captain', 'viewer']).order('full_name')
      .then(({ data }) => setUsers((data ?? []) as Profile[]))
  }, [])

  const roleTag = (r?: string | null) =>
    r === 'admin' ? ' · ADMIN' : r === 'captain' ? ' · Αρχηγός' : ''
  const userOpts = users.map(u => ({
    value: u.id, label: `${u.full_name || u.email || '—'}${roleTag(u.role)}`,
  }))

  async function saveExisting() {
    const u = users.find(x => x.id === pick)
    if (!u) return toast.error('Διάλεξε χρήστη')
    // Ο admin μένει admin — έχει ήδη πρόσβαση σπίκερ και εμφανίζεται στη λίστα.
    if (u.role === 'admin') {
      toast.success('Ο admin έχει ήδη πρόσβαση σπίκερ — εμφανίζεται στη λίστα')
      onSaved(); return
    }
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ role: 'speaker' }).eq('id', u.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Έγινε σπίκερ'); onSaved()
  }

  async function saveNew() {
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
    <Modal title="Προσθήκη · Speaker" onClose={onClose}>
      <div className="flex bg-turf rounded-xl p-[3px] mb-3 border border-chalk/[0.06]">
        {([['existing', 'Υπάρχων χρήστης'], ['new', 'Νέος λογαριασμός']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setMode(v)}
            className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition-colors
              ${mode === v ? 'bg-brand text-chalk' : 'text-dim'}`}>{l}</button>
        ))}
      </div>

      {mode === 'existing' ? (
        <>
          <Select label="ΧΡΗΣΤΗΣ" value={pick} onChange={setPick} options={userOpts} />
          <p className="text-[10.5px] text-dim mb-1 mt-1 leading-snug">
            Διάλεξε κάποιον που υπάρχει ήδη (π.χ. admin) για να μπει ως σπίκερ. Οι admins
            κρατούν τα δικαιώματά τους — απλώς θα μπορείς να τους αναθέτεις/πληρώνεις ως σπίκερ.
          </p>
          <SaveBtn busy={busy} onClick={saveExisting} label="Προσθήκη" />
        </>
      ) : (
        <>
          <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Γιώργος Παπαδόπουλος" />
          <Field label="EMAIL" value={email} onChange={setEmail} placeholder="name@salonicup.gr" />
          <Field label="ΚΩΔΙΚΟΣ" value={pass} onChange={setPass} placeholder="min. 6 χαρακτήρες" />
          <SaveBtn busy={busy} onClick={saveNew} label="Δημιουργία" />
        </>
      )}
    </Modal>
  )
}

/** Referee / Φωτογράφος / Social → μόνο όνομα. */
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

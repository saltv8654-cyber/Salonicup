'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, Loading, Empty } from '@/app/ui'
import { Modal, Field, Select, SaveBtn } from '../ui'
import toast from 'react-hot-toast'
import type { Player, Team } from '@/lib/types'

export default function AdminPlayers() {
  const supabase = createClient()
  const [rows, setRows]   = useState<any[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [team, setTeam]   = useState('')
  const [load, setLoad]   = useState(true)
  const [open, setOpen]   = useState(false)
  const [bulk, setBulk]   = useState(false)
  const [edit, setEdit]   = useState<Player | null>(null)

  async function fetchTeams() {
    const { data } = await supabase.from('teams').select('*').order('name')
    setTeams(data ?? [])
    if (!team && data?.length) setTeam(data[0].team_id)
    setLoad(false)
  }

  async function fetchPlayers(teamId: string) {
    if (!teamId) return
    const { data } = await supabase.from('players').select('*')
      .eq('team_id', teamId).order('number', { nullsFirst: false })
    setRows(data ?? [])
  }

  useEffect(() => { fetchTeams() }, [])
  useEffect(() => { fetchPlayers(team) }, [team])

  async function remove(id: string) {
    if (!confirm('Διαγραφή παίκτη;')) return
    const { error } = await supabase.from('players').delete().eq('player_id', id)
    if (error) return toast.error('Δεν διαγράφηκε')
    toast.success('Διαγράφηκε'); fetchPlayers(team)
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-extrabold text-chalk">Παίκτες</h1>
        <div className="flex gap-2">
          <button onClick={() => setBulk(true)} disabled={!team}
            className="px-3.5 py-2 rounded-lg bg-turf border border-lit/25 text-lit
              text-[12.5px] font-extrabold disabled:opacity-40">
            Μαζική
          </button>
          <button onClick={() => { setEdit(null); setOpen(true) }}
            disabled={!team}
            className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand
              text-white text-[12.5px] font-extrabold disabled:opacity-40">
            + Νέος
          </button>
        </div>
      </div>

      <div className="mb-4">
        <select value={team} onChange={e => setTeam(e.target.value)}
          className="w-full bg-turf rounded-xl px-3.5 py-3 text-chalk text-sm
            outline-none border border-chalk/[0.07]">
          {teams.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
        </select>
      </div>

      {!rows.length ? <Empty>Δεν υπάρχουν παίκτες σε αυτή την ομάδα.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {rows.map(p => (
            <div key={p.player_id}
              className="bg-turf rounded-xl px-3.5 py-2.5 flex items-center gap-3
                border border-chalk/[0.05]">
              <span className="w-6 text-xs font-extrabold text-dim text-center tnum">
                {p.number ?? '—'}
              </span>
              <Avatar url={p.photo_url} name={p.full_name} size={32} />
              <span className="flex-1 text-sm font-semibold text-chalk truncate">
                {p.full_name}
                {!p.active && <span className="text-dim text-[11px] ml-2">ανενεργός</span>}
              </span>
              <button onClick={() => { setEdit(p); setOpen(true) }}
                className="px-3 py-2 rounded-lg bg-chalk/[0.05] text-silver
                  text-[11px] font-bold">Επεξ.</button>
              <button onClick={() => remove(p.player_id)}
                className="px-2.5 py-2 rounded-lg bg-danger/15 text-danger
                  text-[11px] font-bold">✕</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <PlayerForm row={edit} teamId={team} teams={teams}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchPlayers(team) }} />
      )}

      {bulk && (
        <BulkImport teamId={team}
          teamName={teams.find(t => t.team_id === team)?.name ?? ''}
          onClose={() => setBulk(false)}
          onSaved={() => { setBulk(false); fetchPlayers(team) }} />
      )}
    </div>
  )
}

/** Ανάλυση μιας γραμμής → { name, number } */
function parseLine(line: string): { name: string; number: number | null } | null {
  const raw = line.trim()
  if (!raw) return null
  // Excel/CSV: tab, κόμμα ή 2+ κενά χωρίζουν όνομα/νούμερο
  const parts = raw.split(/\t|,|\s{2,}/).map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const numPart = parts.find(p => /^\d{1,3}$/.test(p))
    const namePart = parts.filter(p => !/^\d{1,3}$/.test(p)).join(' ')
    if (namePart) return { name: namePart, number: numPart ? parseInt(numPart) : null }
  }
  // «10 Όνομα»
  let m = raw.match(/^(\d{1,3})\s+(.+)$/)
  if (m) return { name: m[2].trim(), number: parseInt(m[1]) }
  // «Όνομα 10»
  m = raw.match(/^(.+?)\s+(\d{1,3})$/)
  if (m) return { name: m[1].trim(), number: parseInt(m[2]) }
  return { name: raw, number: null }
}

function BulkImport({ teamId, teamName, onClose, onSaved }: {
  teamId: string; teamName: string; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const parsed = text.split('\n').map(parseLine).filter(Boolean) as { name: string; number: number | null }[]

  async function run() {
    if (!parsed.length) return toast.error('Δεν βρέθηκαν ονόματα')
    setBusy(true)
    const payload = parsed.map(p => ({
      team_id: teamId, full_name: p.name, number: p.number, active: true,
    }))
    const { error } = await supabase.from('players').insert(payload)
    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκαν: ' + error.message)
    toast.success(`Προστέθηκαν ${parsed.length} παίκτες`)
    onSaved()
  }

  return (
    <Modal title={`Μαζική εισαγωγή — ${teamName}`} onClose={onClose}>
      <p className="text-[11.5px] text-dim -mt-1 mb-1">
        Επικόλλησε ονόματα, ένα ανά γραμμή. Προαιρετικά νούμερο («10 Όνομα», «Όνομα 10», ή από Excel).
      </p>
      <textarea value={text} onChange={e => setText(e.target.value)}
        rows={9} autoFocus
        placeholder={'Γιώργος Παπαδόπουλος\n10 Νίκος Ιωάννου\nΚώστας Δήμου, 7'}
        className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-[13.5px]
          leading-relaxed outline-none border border-chalk/[0.07] focus:border-lit/50
          placeholder:text-off" />

      {parsed.length > 0 && (
        <div className="bg-turf rounded-xl border border-chalk/[0.05] max-h-40 overflow-y-auto mt-1">
          {parsed.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2
              border-b border-chalk/[0.04] last:border-b-0">
              <span className="w-6 text-[11px] font-extrabold text-dim text-center tnum">
                {p.number ?? '—'}
              </span>
              <span className="flex-1 text-[13px] text-chalk truncate">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <SaveBtn busy={busy} onClick={run}
        label={parsed.length ? `Εισαγωγή ${parsed.length} παικτών` : 'Εισαγωγή'} />
    </Modal>
  )
}

function PlayerForm({ row, teamId, teams, onClose, onSaved }: {
  row: Player | null; teamId: string; teams: Team[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName]   = useState(row?.full_name ?? '')
  const [num, setNum]     = useState(row?.number != null ? String(row.number) : '')
  const [team, setTeam]   = useState(row?.team_id ?? teamId)
  const [photo, setPhoto] = useState(row?.photo_url ?? '')
  const [active, setActive] = useState(row?.active ?? true)
  const [busy, setBusy]   = useState(false)
  const [up, setUp]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setUp(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${row?.player_id ?? 'new'}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('players')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('players').getPublicUrl(path)
      setPhoto(publicUrl)
      toast.success('Φωτογραφία ανέβηκε')
    } catch (e: any) {
      toast.error(e.message ?? 'Δεν ανέβηκε')
    } finally { setUp(false) }
  }

  async function save() {
    if (!name.trim()) return toast.error('Χρειάζεται όνομα')
    setBusy(true)
    const payload = {
      full_name: name.trim(),
      number: num ? parseInt(num) : null,
      team_id: team,
      photo_url: photo || null,
      active,
    }
    const { error } = row
      ? await supabase.from('players').update(payload).eq('player_id', row.player_id)
      : await supabase.from('players').insert(payload)

    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Αποθηκεύτηκε'); onSaved()
  }

  return (
    <Modal title={row ? 'Επεξεργασία παίκτη' : 'Νέος παίκτης'} onClose={onClose}>
      {/* Φωτογραφία */}
      <div className="flex justify-center mb-1">
        <div className="relative">
          <Avatar url={photo} name={name} size={80} ring />
          {up && (
            <div className="absolute inset-0 rounded-full bg-black/60 grid place-items-center">
              <div className="spinner" />
            </div>
          )}
          <button onClick={() => fileRef.current?.click()}
            className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-brand
              border-2 border-turf grid place-items-center text-sm">📷</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </div>
      </div>

      <Field label="ΟΝΟΜΑΤΕΠΩΝΥΜΟ" value={name} onChange={setName}
        placeholder="Παύλου Γιάννης" />
      <Field label="ΝΟΥΜΕΡΟ" value={num} onChange={setNum} numeric placeholder="9" />
      <Select label="ΟΜΑΔΑ" value={team} onChange={setTeam}
        options={teams.map(t => ({ value: t.team_id, label: t.name }))} />

      <label className="flex items-center gap-2.5 mt-1">
        <input type="checkbox" checked={active}
          onChange={e => setActive(e.target.checked)}
          className="w-4 h-4 accent-[#E05B1F]" />
        <span className="text-[13px] text-silver font-semibold">Ενεργός</span>
      </label>

      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

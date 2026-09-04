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
  const [selMode, setSelMode] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const toggleSel = (id: string) => setSel(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

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

  async function removeMany() {
    const ids = [...sel]
    if (!ids.length) return
    if (!confirm(`Διαγραφή ${ids.length} παικτών;`)) return
    const { error } = await supabase.from('players').delete().in('player_id', ids)
    if (error) return toast.error('Δεν διαγράφηκαν: ' + error.message)
    toast.success(`Διαγράφηκαν ${ids.length}`)
    setSel(new Set()); setSelMode(false); fetchPlayers(team)
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-extrabold text-chalk">Παίκτες</h1>
        <div className="flex gap-2">
          {rows.length > 0 && (
            <button onClick={() => { setSelMode(m => !m); setSel(new Set()) }}
              className="px-3.5 py-2 rounded-lg bg-turf border border-chalk/[0.1] text-silver
                text-[12.5px] font-extrabold">
              {selMode ? 'Ακύρωση' : 'Επιλογή'}
            </button>
          )}
          {!selMode && (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className="mb-4">
        <select value={team} onChange={e => setTeam(e.target.value)}
          className="w-full bg-turf rounded-xl px-3.5 py-3 text-chalk text-sm
            outline-none border border-chalk/[0.07]">
          {teams.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
        </select>
      </div>

      {selMode && rows.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setSel(new Set(sel.size === rows.length ? [] : rows.map(p => p.player_id)))}
            className="flex-1 py-2.5 rounded-xl bg-chalk/[0.06] border border-chalk/[0.08] text-silver text-[12.5px] font-bold">
            {sel.size === rows.length ? 'Καμία' : `Όλες (${rows.length})`}
          </button>
          <button onClick={removeMany} disabled={!sel.size}
            className="flex-1 py-2.5 rounded-xl bg-danger/15 border border-danger/30 text-danger text-[12.5px] font-extrabold disabled:opacity-40">
            🗑 Διαγραφή ({sel.size})
          </button>
        </div>
      )}

      {!rows.length ? <Empty>Δεν υπάρχουν παίκτες σε αυτή την ομάδα.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {rows.map(p => {
            const on = sel.has(p.player_id)
            return (
              <div key={p.player_id}
                onClick={selMode ? () => toggleSel(p.player_id) : undefined}
                className={`bg-turf rounded-xl px-3.5 py-2.5 flex items-center gap-3
                  border ${selMode && on ? 'border-lit/50 bg-lit/[0.06]' : 'border-chalk/[0.05]'} ${selMode ? 'active:opacity-80' : ''}`}>
                {selMode ? (
                  <span className={`w-6 h-6 rounded-md grid place-items-center text-[13px] font-extrabold shrink-0 border
                    ${on ? 'bg-lit border-lit text-[#1a1508]' : 'border-chalk/20 text-transparent'}`}>✓</span>
                ) : (
                  <span className="w-6 text-xs font-extrabold text-dim text-center tnum">
                    {p.number ?? '—'}
                  </span>
                )}
                <Avatar url={p.photo_url} name={p.full_name} size={32} />
                <span className="flex-1 text-sm font-semibold text-chalk truncate">
                  {p.full_name}
                  {!p.active && <span className="text-dim text-[11px] ml-2">ανενεργός</span>}
                </span>
                {!selMode && (
                  <>
                    <button onClick={() => { setEdit(p); setOpen(true) }}
                      className="px-3 py-2 rounded-lg bg-chalk/[0.05] text-silver
                        text-[11px] font-bold">Επεξ.</button>
                    <button onClick={() => remove(p.player_id)}
                      className="px-2.5 py-2 rounded-lg bg-danger/15 text-danger
                        text-[11px] font-bold">✕</button>
                  </>
                )}
              </div>
            )
          })}
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

/** Ανάλυση μιας γραμμής → { last, first, number }. Μορφή «Επίθετο Όνομα» (1η λέξη = επίθετο). */
function parseLine(line: string): { last: string; first: string; number: number | null } | null {
  const raw = line.trim()
  if (!raw) return null
  // Χωρισμός πεδίων (Excel/CSV: tab, κόμμα ή 2+ κενά) — βρίσκουμε τυχόν νούμερο
  let fields = raw.split(/\t|,|\s{2,}/).map(s => s.trim()).filter(Boolean)
  let number: number | null = null
  const numIdx = fields.findIndex(p => /^\d{1,3}$/.test(p))
  if (numIdx >= 0) { number = parseInt(fields[numIdx]); fields.splice(numIdx, 1) }
  let nameStr = fields.join(' ')
  // Νούμερο κολλημένο στην αρχή/τέλος («10 Όνομα», «Όνομα 10»)
  if (number == null) {
    let m = nameStr.match(/^(\d{1,3})\s+(.+)$/)
    if (m) { number = parseInt(m[1]); nameStr = m[2] }
    else { m = nameStr.match(/^(.+?)\s+(\d{1,3})$/); if (m) { number = parseInt(m[2]); nameStr = m[1] } }
  }
  nameStr = nameStr.trim()
  if (!nameStr) return null
  const words = nameStr.split(/\s+/)
  return { last: words[0], first: words.slice(1).join(' '), number }
}

function BulkImport({ teamId, teamName, onClose, onSaved }: {
  teamId: string; teamName: string; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const parsed = text.split('\n').map(parseLine).filter(Boolean) as { last: string; first: string; number: number | null }[]

  async function run() {
    if (!parsed.length) return toast.error('Δεν βρέθηκαν ονόματα')
    setBusy(true)
    const payload = parsed.map(p => ({
      team_id: teamId,
      full_name: [p.last, p.first].filter(Boolean).join(' '),
      last_name: p.last || null,
      number: p.number, active: true,
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
        Ένας παίκτης ανά γραμμή, μορφή <span className="text-silver font-bold">Επίθετο Όνομα</span>
        {' '}(η 1η λέξη = επίθετο). Προαιρετικά νούμερο («10 Επίθετο Όνομα», «Επίθετο Όνομα 10», ή από Excel).
      </p>
      <textarea value={text} onChange={e => setText(e.target.value)}
        rows={9} autoFocus
        placeholder={'Παπανικολάου Τάσος\nΘεοδωρίδης Γιώργος\nΨαρόπουλος Ιωάννης 10'}
        className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-[13.5px]
          leading-relaxed outline-none border border-chalk/[0.07] focus:border-lit/50
          placeholder:text-off" />

      {parsed.length > 0 && (
        <div className="bg-turf rounded-xl border border-chalk/[0.05] max-h-40 overflow-y-auto mt-1">
          <div className="flex items-center gap-2.5 px-3 py-1.5 border-b border-chalk/[0.06]
            text-[8.5px] font-extrabold text-dim tracking-wide">
            <span className="w-6 text-center">#</span>
            <span className="flex-1">ΕΠΙΘΕΤΟ</span>
            <span className="flex-1">ΟΝΟΜΑ</span>
          </div>
          {parsed.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2
              border-b border-chalk/[0.04] last:border-b-0">
              <span className="w-6 text-[11px] font-extrabold text-dim text-center tnum">
                {p.number ?? '—'}
              </span>
              <span className="flex-1 text-[13px] font-bold text-chalk truncate">{p.last}</span>
              <span className="flex-1 text-[13px] text-silver truncate">{p.first || '—'}</span>
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
  // Διαχωρισμός Επίθετο / Όνομα. Σε παλιές εγγραφές χωρίς last_name, σπάμε το full_name
  // (σύμβαση «Επίθετο Όνομα»): 1η λέξη = επίθετο, υπόλοιπες = όνομα.
  const _parts = (row?.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  const _initLast: string = (row as any)?.last_name ?? _parts[0] ?? ''
  const _initFirst: string = (row as any)?.last_name
    ? (row?.full_name ?? '').trim().replace(new RegExp(`^${_initLast}\\s*`, 'i'), '').trim() || _parts.slice(1).join(' ')
    : _parts.slice(1).join(' ')
  const [last, setLast]   = useState<string>(_initLast)
  const [first, setFirst] = useState<string>(_initFirst)
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
    if (!last.trim() && !first.trim()) return toast.error('Χρειάζεται όνομα')
    setBusy(true)
    // Ονοματεπώνυμο = «Επίθετο Όνομα» (ό,τι υπάρχει)
    const fullName = [last.trim(), first.trim()].filter(Boolean).join(' ')
    const payload = {
      full_name: fullName,
      last_name: last.trim() || null,
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
          <Avatar url={photo} name={[last, first].filter(Boolean).join(' ')} size={80} ring />
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

      <Field label="ΕΠΙΘΕΤΟ (εμφανίζεται σε εικόνες)" value={last} onChange={setLast}
        placeholder="Παύλου" />
      <Field label="ΟΝΟΜΑ" value={first} onChange={setFirst}
        placeholder="Γιάννης" />
      {(last.trim() || first.trim()) && (
        <p className="text-[10px] text-dim -mt-1 pl-0.5">
          Θα αποθηκευτεί ως: <span className="text-silver font-bold">{[last.trim(), first.trim()].filter(Boolean).join(' ')}</span>
        </p>
      )}
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

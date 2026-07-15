'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Crest, Loading, Empty, Postponements } from '@/app/ui'
import { Modal, Field, Select, SaveBtn } from '../ui'
import { MAX_POSTPONEMENTS } from '@/lib/match'
import toast from 'react-hot-toast'
import type { Team, League } from '@/lib/types'

export default function AdminTeams() {
  const supabase = createClient()
  const [rows, setRows]       = useState<any[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [filter, setFilter]   = useState('')
  const [load, setLoad]       = useState(true)
  const [open, setOpen]       = useState(false)
  const [edit, setEdit]       = useState<Team | null>(null)

  async function fetchRows() {
    const [t, l] = await Promise.all([
      supabase.from('teams').select('*, league:league_id(name)').order('name'),
      supabase.from('leagues').select('*').order('sort_order'),
    ])
    setRows(t.data ?? [])
    setLeagues(l.data ?? [])
    setLoad(false)
  }

  useEffect(() => { fetchRows() }, [])

  async function remove(id: string) {
    if (!confirm('Διαγραφή ομάδας; Θα σβηστούν και οι παίκτες της.')) return
    const { error } = await supabase.from('teams').delete().eq('team_id', id)
    if (error) return toast.error('Δεν διαγράφηκε')
    toast.success('Διαγράφηκε'); fetchRows()
  }

  /** Αναβολή: +1 στην ομάδα που τη ζήτησε */
  async function bumpPostpone(t: Team, delta: number) {
    const next = Math.max(0, (t.postponements ?? 0) + delta)
    const { error } = await supabase.from('teams')
      .update({ postponements: next }).eq('team_id', t.team_id)
    if (error) return toast.error('Δεν ενημερώθηκε')
    if (next >= 3) toast('3η αναβολή — αποβολή!', { icon: '🚫' })
    fetchRows()
  }

  if (load) return <Loading />

  const filtered = filter ? rows.filter(r => r.league_id === filter) : rows

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-extrabold text-chalk">Ομάδες</h1>
        <button onClick={() => { setEdit(null); setOpen(true) }}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand
            text-white text-[12.5px] font-extrabold">+ Νέα</button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        <button onClick={() => setFilter('')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold
            ${!filter ? 'bg-brand text-chalk' : 'bg-turf text-dim'}`}>
          Όλες
        </button>
        {leagues.map(l => (
          <button key={l.league_id} onClick={() => setFilter(l.league_id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold
              whitespace-nowrap ${filter === l.league_id
                ? 'bg-brand text-chalk' : 'bg-turf text-dim'}`}>
            {l.name}
          </button>
        ))}
      </div>

      {!filtered.length ? <Empty>Δεν υπάρχουν ομάδες.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(t => (
            <div key={t.team_id}
              className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                border border-chalk/[0.05]">
              <Crest url={t.logo_url} name={t.name} size={34} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-chalk truncate">{t.name}</p>
                <p className="text-[10.5px] text-dim mt-0.5">{t.league?.name}</p>
              </div>

              {/* Αναβολές */}
              <div className="flex items-center gap-1.5">
                <button onClick={() => bumpPostpone(t, -1)}
                  className="w-6 h-6 rounded-md bg-chalk/[0.05] text-dim
                    text-sm grid place-items-center">−</button>
                <Postponements n={t.postponements ?? 0} max={MAX_POSTPONEMENTS} />
                <button onClick={() => bumpPostpone(t, 1)}
                  className="w-6 h-6 rounded-md bg-chalk/[0.05] text-silver
                    text-sm grid place-items-center">+</button>
              </div>

              <button onClick={() => { setEdit(t); setOpen(true) }}
                className="px-3 py-2 rounded-lg bg-chalk/[0.05] text-silver
                  text-[11px] font-bold">Επεξ.</button>
              <button onClick={() => remove(t.team_id)}
                className="px-2.5 py-2 rounded-lg bg-danger/15 text-danger
                  text-[11px] font-bold">✕</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <TeamForm row={edit} leagues={leagues}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchRows() }} />
      )}
    </div>
  )
}

function TeamForm({ row, leagues, onClose, onSaved }: {
  row: Team | null; leagues: League[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName]     = useState(row?.name ?? '')
  const [league, setLeague] = useState(row?.league_id ?? '')
  const [logo, setLogo]     = useState(row?.logo_url ?? '')
  const [busy, setBusy]     = useState(false)

  async function save() {
    if (!name.trim())  return toast.error('Χρειάζεται όνομα')
    if (!league)       return toast.error('Διάλεξε πρωτάθλημα')
    setBusy(true)

    const payload = {
      name: name.trim(),
      league_id: league,
      logo_url: logo.trim() || null,
    }
    const { error } = row
      ? await supabase.from('teams').update(payload).eq('team_id', row.team_id)
      : await supabase.from('teams').insert(payload)

    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Αποθηκεύτηκε'); onSaved()
  }

  return (
    <Modal title={row ? 'Επεξεργασία ομάδας' : 'Νέα ομάδα'} onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Los Magos" />
      <Select label="ΠΡΩΤΑΘΛΗΜΑ" value={league} onChange={setLeague}
        options={leagues.map(l => ({ value: l.league_id, label: l.name }))} />
      <Field label="LOGO URL" value={logo} onChange={setLogo} placeholder="(προαιρετικό)" />
      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

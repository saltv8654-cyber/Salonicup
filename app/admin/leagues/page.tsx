'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty } from '@/app/ui'
import toast from 'react-hot-toast'
import type { League } from '@/lib/types'
import { Modal, Field, SaveBtn } from '../ui'

export default function AdminLeagues() {
  const supabase = createClient()
  const [rows, setRows]   = useState<League[]>([])
  const [load, setLoad]   = useState(true)
  const [open, setOpen]   = useState(false)
  const [edit, setEdit]   = useState<League | null>(null)

  async function fetchRows() {
    const { data } = await supabase.from('leagues').select('*').order('sort_order')
    setRows(data ?? [])
    setLoad(false)
  }

  useEffect(() => { fetchRows() }, [])

  async function remove(id: string) {
    if (!confirm('Διαγραφή; Θα σβηστούν και οι ομάδες, οι παίκτες και οι αγώνες του.')) return
    const { error } = await supabase.from('leagues').delete().eq('league_id', id)
    if (error) return toast.error('Δεν διαγράφηκε')
    toast.success('Διαγράφηκε')
    fetchRows()
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold text-chalk">Πρωταθλήματα</h1>
        <button onClick={() => { setEdit(null); setOpen(true) }}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand
            text-white text-[12.5px] font-extrabold">
          + Νέο
        </button>
      </div>

      {!rows.length ? <Empty>Δεν υπάρχουν πρωταθλήματα.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {rows.map(l => (
            <div key={l.league_id}
              className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                border border-chalk/[0.05]">
              {l.logo_url
                ? <img src={l.logo_url} alt="" className="w-8 h-8 object-contain" />
                : <span className="text-2xl">🏆</span>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-chalk truncate">{l.name}</p>
                <p className="text-[10.5px] text-dim mt-0.5">
                  {l.season} · #{l.sort_order}
                  {!l.active && ' · ανενεργό'}
                </p>
              </div>
              <button onClick={() => { setEdit(l); setOpen(true) }}
                className="px-3 py-2 rounded-lg bg-chalk/[0.05] text-silver
                  text-[11px] font-bold">
                Επεξ.
              </button>
              <button onClick={() => remove(l.league_id)}
                className="px-3 py-2 rounded-lg bg-danger/15 text-danger
                  text-[11px] font-bold">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <LeagueForm
          row={edit}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchRows() }}
        />
      )}
    </div>
  )
}

function LeagueForm({ row, onClose, onSaved }: {
  row: League | null; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName]     = useState(row?.name ?? '')
  const [season, setSeason] = useState(row?.season ?? '2025-26')
  const [logo, setLogo]     = useState(row?.logo_url ?? '')
  const [order, setOrder]   = useState(String(row?.sort_order ?? 0))
  const [active, setActive] = useState(row?.active ?? true)
  const [busy, setBusy]     = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Χρειάζεται όνομα')
    setBusy(true)

    const payload = {
      name: name.trim(),
      season: season.trim(),
      logo_url: logo.trim() || null,
      sort_order: parseInt(order) || 0,
      active,
    }

    const { error } = row
      ? await supabase.from('leagues').update(payload).eq('league_id', row.league_id)
      : await supabase.from('leagues').insert(payload)

    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Αποθηκεύτηκε')
    onSaved()
  }

  return (
    <Modal title={row ? 'Επεξεργασία' : 'Νέο πρωτάθλημα'} onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Elite League" />
      <Field label="ΣΕΖΟΝ" value={season} onChange={setSeason} placeholder="2025-26" />
      <Field label="LOGO URL" value={logo} onChange={setLogo} placeholder="(προαιρετικό)" />
      <Field label="ΣΕΙΡΑ" value={order} onChange={setOrder} numeric />

      <label className="flex items-center gap-2.5 mt-1">
        <input type="checkbox" checked={active}
          onChange={e => setActive(e.target.checked)}
          className="w-4 h-4 accent-[#E05B1F]" />
        <span className="text-[13px] text-silver font-semibold">Ενεργό</span>
      </label>

      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

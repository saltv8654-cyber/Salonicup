'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty } from '@/app/ui'
import { Field, LogoUpload, SaveBtn } from '../ui'
import toast from 'react-hot-toast'

type Sponsor = { id: string; name: string; logo_url: string | null; link_url: string | null; tier: string; sort: number }

export default function AdminSponsors() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [rows, setRows] = useState<Sponsor[]>([])
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Sponsor | null>(null)

  async function fetchRows() {
    const { data } = await supabase.from('sponsors').select('*').order('tier').order('sort').order('created_at')
    setRows(data ?? [])
    setLoad(false)
  }
  useEffect(() => { fetchRows() }, [])

  async function setTier(id: string, tier: string) {
    await supabase.from('sponsors').update({ tier }).eq('id', id)
    setRows(prev => prev.map(s => s.id === id ? { ...s, tier } : s))
  }
  async function remove(id: string) {
    if (!confirm('Διαγραφή χορηγού;')) return
    await supabase.from('sponsors').delete().eq('id', id)
    setRows(prev => prev.filter(s => s.id !== id))
  }

  if (load) return <Loading />

  const major = rows.filter(s => s.tier === 'major')
  const minor = rows.filter(s => s.tier !== 'major')

  const Group = ({ title, list }: { title: string; list: Sponsor[] }) => (
    <div>
      <p className="text-[12.5px] font-extrabold text-lit mb-2">{title} <span className="text-dim text-[11px]">{list.length}</span></p>
      {!list.length ? <p className="text-[11.5px] text-dim mb-2">—</p> : (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {list.map(s => (
            <div key={s.id} className="bg-turf rounded-xl border border-chalk/[0.05] p-2.5 flex flex-col items-center gap-2">
              <div className="w-full h-16 bg-white rounded-lg grid place-items-center overflow-hidden">
                {s.logo_url ? <img src={s.logo_url} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-2xl">🏢</span>}
              </div>
              <span className="text-[11.5px] font-bold text-chalk truncate w-full text-center">{s.name || '—'}</span>
              {s.link_url && <span className="text-[9px] text-lit truncate w-full text-center -mt-1">🔗 σύνδεσμος</span>}
              <div className="flex gap-1.5 w-full">
                <button onClick={() => { setEdit(s); setOpen(true) }}
                  className="flex-1 py-1.5 rounded-lg bg-chalk/[0.06] text-silver text-[10px] font-bold">Επεξ.</button>
                <button onClick={() => setTier(s.id, s.tier === 'major' ? 'minor' : 'major')}
                  className="flex-1 py-1.5 rounded-lg bg-chalk/[0.06] text-silver text-[10px] font-bold">
                  {s.tier === 'major' ? '→ Μικρός' : '→ Μεγάλος'}
                </button>
                <button onClick={() => remove(s.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-danger/15 text-danger text-[10px] font-bold">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-chalk">Χορηγοί</h1>
        <button onClick={() => { setEdit(null); setOpen(true) }}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand text-white text-[12.5px] font-extrabold">
          + Νέος
        </button>
      </div>

      {!rows.length ? <Empty>Δεν υπάρχουν χορηγοί ακόμα.</Empty> : (
        <>
          <Group title="🥇 Μεγάλοι χορηγοί" list={major} />
          <Group title="🤝 Μικροί χορηγοί" list={minor} />
        </>
      )}

      {open && <SponsorForm row={edit} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); fetchRows() }} />}
    </div>
  )
}

function SponsorForm({ row, onClose, onSaved }: { row: Sponsor | null; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState(row?.name ?? '')
  const [logo, setLogo] = useState(row?.logo_url ?? '')
  const [link, setLink] = useState(row?.link_url ?? '')
  const [tier, setTier] = useState<'major' | 'minor'>(row?.tier === 'minor' ? 'minor' : 'major')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!logo && !name.trim()) return toast.error('Βάλε λογότυπο ή όνομα')
    let url = link.trim()
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url  // συμπληρώνουμε το https:// αν λείπει
    setBusy(true)
    const payload = { name: name.trim(), logo_url: logo || null, link_url: url || null, tier }
    const { error } = row
      ? await supabase.from('sponsors').update(payload).eq('id', row.id)
      : await supabase.from('sponsors').insert(payload)
    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε: ' + error.message)
    toast.success(row ? 'Αποθηκεύτηκε' : 'Προστέθηκε'); onSaved()
  }

  // Χρησιμοποιώ το ui Modal μέσω απλού overlay για να μη φέρω extra import
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-pitch rounded-2xl border border-chalk/[0.08] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-chalk">{row ? 'Επεξεργασία χορηγού' : 'Νέος χορηγός'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-chalk/[0.06] text-silver">✕</button>
        </div>
        <LogoUpload bucket="logos" url={logo} onChange={setLogo} fallback="🏢" label="ΛΟΓΟΤΥΠΟ" />
        <Field label="ΟΝΟΜΑ (προαιρετικό)" value={name} onChange={setName} placeholder="π.χ. Corpus Therapy" />
        <Field label="ΣΥΝΔΕΣΜΟΣ (site χορηγού)" value={link} onChange={setLink} placeholder="π.χ. corpustherapy.gr" />
        <div>
          <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">ΚΑΤΗΓΟΡΙΑ</label>
          <div className="flex gap-2">
            {([['major', '🥇 Μεγάλος'], ['minor', '🤝 Μικρός']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setTier(v)}
                className={`flex-1 py-2.5 rounded-xl text-[12.5px] font-bold border
                  ${tier === v ? 'bg-brand text-chalk border-lit' : 'bg-turf text-dim border-chalk/[0.06]'}`}>{lbl}</button>
            ))}
          </div>
        </div>
        <SaveBtn busy={busy} onClick={save} label={row ? 'Αποθήκευση' : 'Προσθήκη'} />
      </div>
    </div>
  )
}

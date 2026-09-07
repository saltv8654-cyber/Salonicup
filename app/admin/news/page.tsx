'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty } from '@/app/ui'
import { Modal, Field, LogoUpload, SaveBtn } from '../ui'
import toast from 'react-hot-toast'

type Article = { id: string; title: string; body: string; cover_url: string | null; published: boolean; created_at: string }

export default function AdminNews() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [rows, setRows] = useState<Article[]>([])
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Article | null>(null)

  async function fetchRows() {
    const { data } = await supabase.from('articles').select('*').order('created_at', { ascending: false })
    setRows(data ?? [])
    setLoad(false)
  }
  useEffect(() => { fetchRows() }, [])

  async function togglePub(a: Article) {
    await supabase.from('articles').update({ published: !a.published }).eq('id', a.id)
    setRows(prev => prev.map(x => x.id === a.id ? { ...x, published: !a.published } : x))
  }
  async function remove(id: string) {
    if (!confirm('Διαγραφή άρθρου;')) return
    await supabase.from('articles').delete().eq('id', id)
    setRows(prev => prev.filter(x => x.id !== id))
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-chalk">Νέα · Άρθρα</h1>
        <button onClick={() => { setEdit(null); setOpen(true) }}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand text-white text-[12.5px] font-extrabold">
          + Νέο
        </button>
      </div>

      {!rows.length ? <Empty>Δεν υπάρχουν άρθρα ακόμα.</Empty> : (
        <div className="flex flex-col gap-2">
          {rows.map(a => (
            <div key={a.id} className="bg-turf rounded-xl border border-chalk/[0.05] p-3 flex items-center gap-3">
              {a.cover_url
                ? <img src={a.cover_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                : <div className="w-14 h-14 rounded-lg bg-chalk/[0.05] grid place-items-center text-xl shrink-0">📰</div>}
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-bold text-chalk truncate">{a.title || '—'}</p>
                <p className="text-[10.5px] text-dim truncate">{a.body.slice(0, 60)}</p>
                <p className="text-[9px] mt-0.5" style={{ color: a.published ? '#2FA84F' : '#8a8a93' }}>
                  {a.published ? '● Δημοσιευμένο' : '○ Πρόχειρο'} · {new Date(a.created_at).toLocaleDateString('el-GR')}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => { setEdit(a); setOpen(true) }}
                  className="px-2.5 py-1.5 rounded-lg bg-chalk/[0.05] text-silver text-[10.5px] font-bold">Επεξ.</button>
                <button onClick={() => togglePub(a)}
                  className="px-2.5 py-1.5 rounded-lg bg-chalk/[0.05] text-silver text-[10.5px] font-bold">
                  {a.published ? 'Απόσυρση' : 'Δημοσίευση'}</button>
                <button onClick={() => remove(a.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-danger/15 text-danger text-[10.5px] font-bold">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && <ArticleForm row={edit} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); fetchRows() }} />}
    </div>
  )
}

function ArticleForm({ row, onClose, onSaved }: { row: Article | null; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [title, setTitle] = useState(row?.title ?? '')
  const [body, setBody] = useState(row?.body ?? '')
  const [cover, setCover] = useState(row?.cover_url ?? '')
  const [published, setPublished] = useState(row?.published ?? true)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim()) return toast.error('Χρειάζεται τίτλος')
    setBusy(true)
    const payload = { title: title.trim(), body, cover_url: cover || null, published, updated_at: new Date().toISOString() }
    const { error } = row
      ? await supabase.from('articles').update(payload).eq('id', row.id)
      : await supabase.from('articles').insert(payload)
    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε: ' + error.message)
    toast.success('Αποθηκεύτηκε'); onSaved()
  }

  return (
    <Modal title={row ? 'Επεξεργασία άρθρου' : 'Νέο άρθρο'} onClose={onClose}>
      <Field label="ΤΙΤΛΟΣ" value={title} onChange={setTitle} placeholder="π.χ. Ξεκίνησαν τα playoff!" />
      <div>
        <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">ΚΥΡΙΩΣ ΚΕΙΜΕΝΟ</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={9}
          placeholder="Γράψε εδώ το άρθρο…"
          className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-[13.5px] leading-relaxed
            outline-none border border-chalk/[0.07] focus:border-lit/50 placeholder:text-off" />
      </div>
      <LogoUpload bucket="logos" url={cover} onChange={setCover} fallback="📰" label="ΕΙΚΟΝΑ (προαιρετική)" />
      <label className="flex items-center gap-2.5 mt-1">
        <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)}
          className="w-4 h-4 accent-[#E05B1F]" />
        <span className="text-[12.5px] text-silver font-semibold">Δημοσιευμένο (ορατό στο site)</span>
      </label>
      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

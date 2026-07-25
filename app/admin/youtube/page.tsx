'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'

type Channel = {
  id: string; label: string; channel_id: string | null
  ingest_url: string | null; stream_key: string | null; created_at: string
}

export default function Page() {
  return <Suspense><YouTubeAdmin /></Suspense>
}

function YouTubeAdmin() {
  const params = useSearchParams()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [reveal, setReveal] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    const r = await fetch('/api/youtube/channels')
    const j = await r.json().catch(() => ({}))
    setChannels(j.channels ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (params.get('ok')) toast.success('Το κανάλι συνδέθηκε!')
    const err = params.get('err')
    if (err === 'not-configured') toast.error('Λείπουν τα κλειδιά YouTube από τον server')
    else if (err) toast.error('Η σύνδεση απέτυχε — δοκίμασε ξανά')
  }, [params])

  async function remove(id: string) {
    if (!confirm('Αποσύνδεση καναλιού;')) return
    await fetch('/api/youtube/channels', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }) })
    toast.success('Αποσυνδέθηκε')
    load()
  }

  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success('Αντιγράφηκε') }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-5">
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup · Admin</p>
        <h1 className="text-xl font-extrabold text-chalk mt-1 tracking-tight">Κανάλια YouTube</h1>
        <p className="text-[12.5px] text-dim mt-1.5 leading-relaxed">
          Σύνδεσε τα κανάλια μία φορά. Μετά, ο speaker πατά «Δημιουργία ροής» σε κάθε αγώνα
          και η ζωντανή μετάδοση φτιάχνεται αυτόματα.
        </p>
      </div>

      <a href="/api/youtube/connect"
        className="block w-full text-center py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
          text-white font-extrabold text-[15px] shadow-[0_4px_16px_rgba(224,91,31,0.3)] mb-5">
        + Σύνδεση καναλιού YouTube
      </a>

      {loading ? (
        <p className="text-dim text-sm text-center py-8">Φόρτωση…</p>
      ) : channels.length === 0 ? (
        <div className="bg-turf rounded-xl p-5 border border-chalk/[0.05] text-center">
          <p className="text-silver text-[13.5px] font-semibold">Κανένα κανάλι ακόμα</p>
          <p className="text-dim text-[12px] mt-1">Πάτα «Σύνδεση καναλιού» για να ξεκινήσεις.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {channels.map(c => (
            <div key={c.id} className="bg-turf rounded-xl p-4 border border-chalk/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">📺</span>
                  <span className="font-extrabold text-chalk text-[15px] truncate">{c.label}</span>
                </div>
                <button onClick={() => remove(c.id)}
                  className="text-[11px] font-bold text-red-400 px-2 py-1 rounded-lg bg-red-500/10">
                  Αποσύνδεση
                </button>
              </div>

              {/* Στοιχεία OBS — βάλ' τα μία φορά στο OBS → Settings → Stream */}
              <div className="mt-3 pt-3 border-t border-chalk/[0.06] flex flex-col gap-2">
                <p className="text-[9px] font-extrabold text-dim tracking-[0.12em] uppercase">Ρυθμίσεις OBS</p>
                <Field label="Server (URL)" value={c.ingest_url ?? '—'} onCopy={copy} />
                <Field label="Stream Key" value={c.stream_key ?? '—'} onCopy={copy}
                  secret revealed={!!reveal[c.id]} onToggle={() => setReveal(r => ({ ...r, [c.id]: !r[c.id] }))} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-chalk/[0.03] rounded-xl p-4 border border-chalk/[0.05]">
        <p className="text-[11px] font-extrabold text-silver tracking-[0.08em] uppercase mb-2">Πώς δουλεύει</p>
        <ol className="text-[12.5px] text-dim leading-relaxed list-decimal pl-4 flex flex-col gap-1">
          <li>Σύνδεσε το κάθε κανάλι εδώ (μία φορά).</li>
          <li>Βάλε στο OBS το Server + Stream Key του καναλιού (μία φορά).</li>
          <li>Στον αγώνα: «Δημιουργία ροής» → πάτα Start Streaming στο OBS → είσαι live.</li>
        </ol>
      </div>
    </div>
  )
}

function Field({ label, value, onCopy, secret, revealed, onToggle }: {
  label: string; value: string; onCopy: (t: string) => void
  secret?: boolean; revealed?: boolean; onToggle?: () => void
}) {
  const shown = secret && !revealed ? '••••••••••••••••' : value
  return (
    <div>
      <label className="block text-[9px] font-bold text-dim tracking-[0.1em] mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 bg-pitch rounded-lg px-3 py-2 text-[12px] text-chalk truncate border border-chalk/[0.06]">
          {shown}
        </code>
        {secret && (
          <button onClick={onToggle}
            className="px-2.5 py-2 rounded-lg bg-chalk/[0.06] text-silver text-[11px] font-bold">
            {revealed ? 'Κρύψε' : 'Δείξε'}
          </button>
        )}
        <button onClick={() => onCopy(value)}
          className="px-2.5 py-2 rounded-lg bg-chalk/[0.06] text-silver text-[11px] font-bold">
          Αντιγραφή
        </button>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { fmtDay, fmtTime } from '@/lib/time'
import toast from 'react-hot-toast'

type St = 'ok' | 'reschedule' | 'postpone'
type FreeSlot = { iso: string; field: string | null; venue: string | null }
type Resp = { status: St; note: string | null }

// Κλειδί εβδομάδας (Δευ–Κυρ) για να δείχνουμε μόνο ελεύθερα ΤΗΣ εβδομάδας του αγώνα.
const weekKey = (iso: string) => {
  const d = new Date(iso)
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return `${m.getFullYear()}-${m.getMonth()}-${m.getDate()}`
}

const OPTS: { v: St; label: string; on: string }[] = [
  { v: 'ok',         label: '✓ ΟΚ',       on: 'bg-[#2FA84F] text-white border-[#2FA84F]' },
  { v: 'reschedule', label: 'Αλλαγή ώρας', on: 'bg-[#c9a227] text-black border-[#c9a227]' },
  { v: 'postpone',   label: 'Αναβολή',     on: 'bg-danger text-white border-danger' },
]
const PILL: Record<St, { txt: string; bg: string; fg: string }> = {
  ok:         { txt: 'ΟΚ',           bg: 'rgba(47,168,79,0.16)',  fg: '#2FA84F' },
  reschedule: { txt: 'αλλαγή ώρας',  bg: 'rgba(201,162,39,0.18)', fg: '#e8b923' },
  postpone:   { txt: 'αναβολή',      bg: 'rgba(216,72,60,0.16)',  fg: '#D8483C' },
}

function Pill({ s }: { s: St }) {
  const p = PILL[s]
  return <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
    style={{ background: p.bg, color: p.fg }}>{p.txt}</span>
}

/** Απαντήσεις captain για έναν αγώνα + read-only εικόνα για admin/αντίπαλο. */
export default function MatchResponse({ match, freeSlots = [] }: { match: any; freeSlots?: FreeSlot[] }) {
  const supabase = createClient()
  const { profile, loading } = useAuth()
  const [bySide, setBySide] = useState<{ a?: Resp; b?: Resp }>({})
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<null | 'reschedule' | 'postpone'>(null)

  const isAdmin = profile?.role === 'admin'
  const myTeam = profile?.team_id ?? null
  const mySide: 'a' | 'b' | null = myTeam === match.team_a ? 'a' : myTeam === match.team_b ? 'b' : null
  const show = isAdmin || !!mySide
  // Μόνο ελεύθερα της ΙΔΙΑΣ εβδομάδας με τον αγώνα
  const weekSlots = match.match_date
    ? freeSlots.filter(s => weekKey(s.iso) === weekKey(match.match_date))
    : freeSlots

  const nameA = match.team_a_data?.name ?? match.placeholder_a ?? 'Ομάδα Α'
  const nameB = match.team_b_data?.name ?? match.placeholder_b ?? 'Ομάδα Β'

  async function load() {
    const { data } = await supabase.from('match_responses')
      .select('team_id, status, note').eq('match_id', match.match_id)
    const map: { a?: Resp; b?: Resp } = {}
    for (const r of data ?? []) {
      const side = r.team_id === match.team_a ? 'a' : r.team_id === match.team_b ? 'b' : null
      if (side) map[side] = { status: r.status as St, note: r.note }
    }
    setBySide(map); setReady(true)
  }
  useEffect(() => { if (show) load(); else setReady(true) }, [show, match.match_id])

  async function submit(v: St, note: string | null) {
    if (!mySide || busy) return
    setBusy(true)
    const { error } = await supabase.from('match_responses').upsert({
      match_id: match.match_id, team_id: myTeam, user_id: profile!.id,
      status: v, note, updated_at: new Date().toISOString(),
    }, { onConflict: 'match_id,team_id' })
    setBusy(false); setModal(null)
    if (error) return toast.error('Δεν αποθηκεύτηκε: ' + error.message)
    setBySide(prev => ({ ...prev, [mySide]: { status: v, note } }))
    toast.success(v === 'ok' ? 'Επιβεβαιώθηκε' : 'Στάλθηκε')
    if (v !== 'ok') {
      fetch('/api/notify-captain-response', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: match.match_id, status: v, note }),
      }).catch(() => {})
    }
  }

  if (loading || !ready || !show) return null

  // ── Admin: read-only και οι δύο πλευρές ──
  if (isAdmin && !mySide) {
    if (!bySide.a && !bySide.b) return null
    return (
      <div className="mt-2 pt-2 border-t border-chalk/[0.05] flex flex-col gap-1">
        {(['a', 'b'] as const).map(s => bySide[s] && (
          <div key={s} className="flex items-center gap-1.5 text-[10.5px]">
            <span className="text-silver font-bold truncate max-w-[45%]">{s === 'a' ? nameA : nameB}</span>
            <Pill s={bySide[s]!.status} />
            {bySide[s]!.note && <span className="text-off truncate">«{bySide[s]!.note}»</span>}
          </div>
        ))}
      </div>
    )
  }

  // ── Captain μιας συμμετέχουσας ομάδας ──
  const mine = mySide ? bySide[mySide] : undefined
  const oppSide = mySide === 'a' ? 'b' : 'a'
  const opp = bySide[oppSide]
  const oppName = oppSide === 'a' ? nameA : nameB

  return (
    <div className="mt-2 pt-2 border-t border-chalk/[0.05]">
      <div className="flex items-center gap-1.5">
        {OPTS.map(o => (
          <button key={o.v} disabled={busy}
            onClick={() => o.v === 'ok' ? submit('ok', null) : setModal(o.v)}
            className={`flex-1 py-1.5 rounded-lg text-[10.5px] font-extrabold border transition-colors
              ${mine?.status === o.v ? o.on : 'bg-chalk/[0.04] text-dim border-chalk/[0.06]'} disabled:opacity-50`}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Απάντηση αντιπάλου */}
      {opp && (
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px]">
          <span className="text-dim">Αντίπαλος:</span>
          <span className="text-silver font-bold truncate max-w-[35%]">{oppName}</span>
          <Pill s={opp.status} />
          {opp.note && <span className="text-off truncate">«{opp.note}»</span>}
        </div>
      )}
      {opp && opp.status !== 'ok' && mine?.status !== 'ok' && (
        <button disabled={busy} onClick={() => submit('ok', null)}
          className="mt-1.5 w-full py-1.5 rounded-lg text-[10.5px] font-extrabold border
            bg-[#2FA84F]/15 text-[#2FA84F] border-[#2FA84F]/40 disabled:opacity-50">
          ✓ Συμφωνώ με το αίτημα του αντιπάλου
        </button>
      )}

      {modal && (
        <RequestModal kind={modal} freeSlots={weekSlots} busy={busy}
          onClose={() => setModal(null)}
          onSubmit={note => submit(modal, note)} />
      )}
    </div>
  )
}

function RequestModal({ kind, freeSlots, busy, onClose, onSubmit }: {
  kind: 'reschedule' | 'postpone'; freeSlots: FreeSlot[]; busy: boolean
  onClose: () => void; onSubmit: (note: string | null) => void
}) {
  const [text, setText] = useState('')
  const [pick, setPick] = useState<string | null>(null)

  const note = () => {
    if (kind === 'reschedule' && pick) return pick + (text.trim() ? ` — ${text.trim()}` : '')
    return text.trim() || null
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-pitch rounded-2xl border border-chalk/[0.08] p-4 flex flex-col gap-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-chalk">
            {kind === 'reschedule' ? 'Αίτημα αλλαγής ώρας' : 'Αίτημα αναβολής'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-chalk/[0.06] text-silver">✕</button>
        </div>

        {kind === 'reschedule' && (
          <div>
            <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">
              ΔΙΑΘΕΣΙΜΑ ΓΗΠΕΔΑ — διάλεξε τι σε βολεύει
            </label>
            {!freeSlots.length ? (
              <p className="text-[11px] text-off mb-1">Δεν υπάρχουν καταχωρημένες ελεύθερες ώρες — γράψε από κάτω τι σε βολεύει.</p>
            ) : (
              <div className="flex flex-col gap-1.5 mb-1 max-h-[38vh] overflow-y-auto">
                {freeSlots.map((s, i) => {
                  const lbl = `${fmtDay(s.iso)} · ${fmtTime(s.iso)}${s.field ? ` · ${s.field}` : ''}`
                  const on = pick === lbl
                  return (
                    <button key={i} onClick={() => setPick(on ? null : lbl)}
                      className={`text-left px-3 py-2 rounded-lg text-[12px] font-bold border
                        ${on ? 'bg-brand text-chalk border-lit' : 'bg-chalk/[0.04] text-silver border-chalk/[0.06]'}`}>
                      {lbl}{s.venue ? <span className="block text-[9px] text-off font-normal">{s.venue}</span> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">
            {kind === 'reschedule' ? 'ΣΧΟΛΙΟ (προαιρετικό)' : 'ΛΟΓΟΣ ΑΝΑΒΟΛΗΣ (προαιρετικό)'}
          </label>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
            placeholder={kind === 'reschedule' ? 'π.χ. μετά τις 21:00' : 'π.χ. λείπουν 4 παίκτες'}
            className="w-full bg-chalk/[0.04] rounded-xl px-3 py-2.5 text-chalk text-[13px] outline-none
              border border-chalk/[0.07] focus:border-lit/50 placeholder:text-off" />
        </div>

        <button disabled={busy} onClick={() => onSubmit(note())}
          className="w-full py-3 rounded-xl bg-gradient-to-b from-lit to-brand text-white font-extrabold text-[14px] disabled:opacity-50">
          {busy ? 'Αποστολή…' : 'Στείλε αίτημα'}
        </button>
      </div>
    </div>
  )
}

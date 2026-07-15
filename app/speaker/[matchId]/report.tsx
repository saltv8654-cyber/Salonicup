'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { EVENTS } from '@/lib/match'
import toast from 'react-hot-toast'
import type { EventType } from '@/lib/types'

export default function ReportSheet({ match, events, onClose, onFinished }: {
  match: any
  events: any[]
  onClose: () => void
  onFinished: () => void
}) {
  const supabase = createClient()
  const { profile } = useAuth()
  const [text, setText]     = useState(match.report ?? '')
  const [busy, setBusy]     = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const done = ['Played', 'Forfeit'].includes(match.match_status)

  async function generate() {
    setBusy(true)
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.match_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Αποτυχία')
      setText(data.report)
    } catch (e: any) {
      toast.error(e.message ?? 'Δεν δημιουργήθηκε το κείμενο')
    } finally {
      setBusy(false)
    }
  }

  /** Αποθηκεύει το κείμενο και κλείνει τον αγώνα */
  async function finish() {
    setSaving(true)
    const { error } = await supabase.from('matches').update({
      report: text || null,
      match_status: done ? match.match_status : 'Played',
      updated_by: profile?.id,
    }).eq('match_id', match.match_id)
    setSaving(false)

    if (error) { toast.error('Δεν αποθηκεύτηκε'); return }
    toast.success(done ? 'Αποθηκεύτηκε' : 'Ο αγώνας έληξε')
    onFinished()
  }

  function copy() {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const count = events.filter(e => e.period !== 'PEN').length

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative bg-turf rounded-t-[20px] max-h-[88vh] flex flex-col
        border-t-2 border-brand">

        <div className="px-4.5 pt-4.5 pb-3.5 shrink-0 border-b border-chalk/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h3 className="text-base font-extrabold text-chalk">Κείμενο αγώνα</h3>
              <p className="text-[11px] text-dim mt-0.5">
                {match.team_a_data?.name} {match.goals_team_a}–{match.goals_team_b}{' '}
                {match.team_b_data?.name}
              </p>
            </div>
            <button onClick={onClose}
              className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06]
                grid place-items-center text-silver text-sm">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
          {busy ? (
            <div className="text-center py-11">
              <div className="spinner mx-auto mb-3.5" />
              <p className="text-[12.5px] text-dim">Γράφει…</p>
            </div>
          ) : !text ? (
            <div className="text-center py-8 px-2.5">
              <div className="text-4xl mb-3">📝</div>
              <p className="text-[13px] text-silver leading-relaxed mb-1">
                Το AI θα γράψει το ρεπορτάζ από τις φάσεις που κατέγραψες.
              </p>
              <p className="text-[11px] text-dim">
                {count} {count === 1 ? 'φάση' : 'φάσεις'}
              </p>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full min-h-[340px] bg-chalk/[0.03] rounded-xl p-3.5
                text-chalk text-[13.5px] leading-relaxed outline-none resize-y
                border border-chalk/[0.07] focus:border-lit/40"
            />
          )}
        </div>

        <div className="px-4 pt-2.5 pb-6 flex flex-col gap-2 shrink-0">
          {!text ? (
            <button onClick={generate} disabled={busy}
              className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
                text-white font-extrabold text-[15px] disabled:opacity-50
                shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
              {busy ? 'Γράφει…' : 'Δημιουργία κειμένου'}
            </button>
          ) : (
            <>
              <button onClick={finish} disabled={saving}
                className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
                  text-white font-extrabold text-[15px] disabled:opacity-50
                  shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
                {saving ? 'Αποθήκευση…' : done ? 'Αποθήκευση' : 'Αποθήκευση & λήξη'}
              </button>
              <div className="flex gap-2">
                <button onClick={copy}
                  className="flex-1 py-3 rounded-xl bg-chalk/[0.05] text-silver
                    font-bold text-[13px]">
                  {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
                </button>
                <button onClick={generate} disabled={busy}
                  className="flex-1 py-3 rounded-xl bg-chalk/[0.05] text-silver
                    font-bold text-[13px] disabled:opacity-50">
                  Ξαναγράψ' το
                </button>
              </div>
            </>
          )}

          {!done && (
            <button onClick={finish} disabled={saving}
              className="w-full py-2.5 text-dim font-semibold text-[12px]">
              Λήξη χωρίς κείμενο
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

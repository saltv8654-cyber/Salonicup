'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import toast from 'react-hot-toast'

type St = 'ok' | 'reschedule' | 'postpone'

const OPTS: { v: St; label: string; on: string; ring: string }[] = [
  { v: 'ok',         label: '✓ ΟΚ',          on: 'bg-[#2FA84F] text-white',  ring: 'border-[#2FA84F]/40' },
  { v: 'reschedule', label: 'Αλλαγή ώρας',    on: 'bg-[#c9a227] text-black',  ring: 'border-[#c9a227]/40' },
  { v: 'postpone',   label: 'Αναβολή',        on: 'bg-danger text-white',     ring: 'border-danger/40' },
]

/** Κουμπιά απάντησης captain για έναν αγώνα (φαίνονται μόνο στον captain της συμμετέχουσας ομάδας). */
export default function MatchResponse({ match }: { match: any }) {
  const supabase = createClient()
  const { profile, loading } = useAuth()
  const [status, setStatus] = useState<St | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  const myTeam = profile?.team_id ?? null
  const mine = !!myTeam && (myTeam === match.team_a || myTeam === match.team_b)

  useEffect(() => {
    if (!mine) { setReady(true); return }
    supabase.from('match_responses').select('status')
      .eq('match_id', match.match_id).eq('team_id', myTeam).maybeSingle()
      .then(({ data }) => { setStatus((data?.status as St) ?? null); setReady(true) })
  }, [mine, match.match_id, myTeam])

  if (loading || !ready || !mine) return null

  async function choose(v: St) {
    if (busy) return
    setBusy(true)
    let note: string | null = null
    if (v !== 'ok') {
      note = (window.prompt(v === 'reschedule'
        ? 'Πες μας τι ώρα σε βολεύει (προαιρετικό):'
        : 'Λόγος αναβολής (προαιρετικό):') ?? '').trim() || null
    }
    const { error } = await supabase.from('match_responses').upsert({
      match_id: match.match_id, team_id: myTeam, user_id: profile!.id,
      status: v, note, updated_at: new Date().toISOString(),
    }, { onConflict: 'match_id,team_id' })
    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε: ' + error.message)
    setStatus(v)
    toast.success(v === 'ok' ? 'Επιβεβαιώθηκε' : 'Στάλθηκε στη διοργάνωση')
    if (v !== 'ok') {
      fetch('/api/notify-captain-response', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: match.match_id, status: v, note }),
      }).catch(() => {})
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-chalk/[0.05]">
      <div className="flex items-center gap-1.5">
        {OPTS.map(o => (
          <button key={o.v} onClick={() => choose(o.v)} disabled={busy}
            className={`flex-1 py-1.5 rounded-lg text-[10.5px] font-extrabold border transition-colors
              ${status === o.v ? `${o.on} ${o.ring}` : 'bg-chalk/[0.04] text-dim border-chalk/[0.06]'}
              disabled:opacity-50`}>
            {o.label}
          </button>
        ))}
      </div>
      {status && status !== 'ok' && (
        <p className="text-[9px] text-off mt-1 pl-0.5">Η διοργάνωση ειδοποιήθηκε — αναμονή απάντησης.</p>
      )}
    </div>
  )
}

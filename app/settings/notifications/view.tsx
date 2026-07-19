'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { enablePush, pushSupported, pushState } from '@/lib/push'
import toast from 'react-hot-toast'

interface League { league_id: string; name: string; logo_url: string | null }

const TYPES: { key: 'notify_goal' | 'notify_start' | 'notify_red' | 'notify_final'; icon: string; label: string }[] = [
  { key: 'notify_goal',  icon: '⚽', label: 'Γκολ' },
  { key: 'notify_start', icon: '🟢', label: 'Έναρξη αγώνα' },
  { key: 'notify_red',   icon: '🟥', label: 'Κόκκινη κάρτα' },
  { key: 'notify_final', icon: '🏁', label: 'Τελικό σφύριγμα' },
]

export default function NotificationSettings({ leagues }: { leagues: League[] }) {
  const [supported, setSupported] = useState(true)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const [types, setTypes] = useState<Record<string, boolean>>({
    notify_goal: true, notify_start: true, notify_red: true, notify_final: true,
  })
  // Σύνολο επιλεγμένων πρωταθλημάτων· κενό = ΟΛΑ
  const [leagueSel, setLeagueSel] = useState<Set<string> | null>(null) // null = όλα

  useEffect(() => {
    const sup = pushSupported()
    setSupported(sup)
    if (!sup) { setSubscribed(false); return }
    ;(async () => {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setSubscribed(false); return }
      setSubscribed(true)
      setEndpoint(sub.endpoint)
      const r = await fetch('/api/push/prefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).then(x => x.json()).catch(() => null)
      const p = r?.prefs
      if (p) {
        setTypes({
          notify_goal:  p.notify_goal  !== false,
          notify_start: p.notify_start !== false,
          notify_red:   p.notify_red   !== false,
          notify_final: p.notify_final !== false,
        })
        setLeagueSel(Array.isArray(p.league_ids) && p.league_ids.length
          ? new Set(p.league_ids) : null)
      }
    })()
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const ep = await enablePush()
      setEndpoint(ep)
      setSubscribed(true)
      toast.success('Ειδοποιήσεις ενεργές ⚽')
    } catch (e: any) {
      toast.error(e?.message ?? 'Δεν ενεργοποιήθηκαν')
    } finally { setBusy(false) }
  }

  const allLeagues = leagueSel === null
  function toggleLeague(id: string) {
    setLeagueSel(prev => {
      // ξεκινάμε από «όλα» → όλα εκτός από αυτό που ξεπατικώθηκε
      const base = prev ?? new Set(leagues.map(l => l.league_id))
      const next = new Set(base)
      if (next.has(id)) next.delete(id); else next.add(id)
      // αν είναι όλα επιλεγμένα, αποθηκεύουμε ως «όλα» (null)
      return next.size === leagues.length ? null : next
    })
  }

  async function save() {
    if (!endpoint) return
    setSaving(true)
    const league_ids = leagueSel === null ? [] : [...leagueSel]
    const r = await fetch('/api/push/prefs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, prefs: { ...types, league_ids } }),
    }).then(x => x.json()).catch(() => null)
    setSaving(false)
    if (r?.ok) toast.success('Αποθηκεύτηκε')
    else toast.error('Δεν αποθηκεύτηκε')
  }

  return (
    <>
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-1">
        <Link href="/"
          className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center
            text-silver text-base">‹</Link>
        <span className="text-[10.5px] text-dim font-bold">Ρυθμίσεις</span>
      </div>

      <header className="px-4 pt-3 pb-4">
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Ειδοποιήσεις</h1>
      </header>

      {subscribed === null ? (
        <div className="grid place-items-center py-16"><div className="spinner" /></div>
      ) : !supported ? (
        <div className="px-4">
          <div className="bg-turf rounded-xl p-4 border border-chalk/[0.06] text-center">
            <p className="text-[13px] text-silver leading-relaxed">
              Για ειδοποιήσεις σε iPhone: πρόσθεσε πρώτα την εφαρμογή στην αρχική οθόνη
              (Κοινή χρήση ↑ → «Προσθήκη στην αρχική οθόνη») και άνοιξέ την από εκεί.
            </p>
          </div>
        </div>
      ) : !subscribed ? (
        <div className="px-4">
          <div className="bg-turf rounded-xl p-5 border border-chalk/[0.06] text-center">
            <div className="text-4xl mb-3">🔔</div>
            <p className="text-[13.5px] text-silver leading-relaxed mb-4">
              Ενεργοποίησε τις ειδοποιήσεις για να λαμβάνεις γκολ, εναρξη αγώνων και αποτελέσματα.
            </p>
            <button onClick={enable} disabled={busy}
              className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
                text-white font-extrabold text-[15px] disabled:opacity-50
                shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
              {busy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση ειδοποιήσεων'}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3.5 flex flex-col gap-5">
          {/* Τύποι */}
          <div>
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-dim mb-2 px-1">
              Τι θέλεις να λαμβάνεις
            </p>
            <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
              {TYPES.map((t, i) => (
                <button key={t.key} onClick={() => setTypes(s => ({ ...s, [t.key]: !s[t.key] }))}
                  className={`w-full flex items-center gap-3 px-3.5 py-3.5 text-left
                    ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                  <span className="text-lg">{t.icon}</span>
                  <span className="flex-1 text-[14px] font-semibold text-chalk">{t.label}</span>
                  <Switch on={types[t.key]} />
                </button>
              ))}
            </div>
          </div>

          {/* Πρωταθλήματα */}
          {leagues.length > 1 && (
            <div>
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-dim mb-2 px-1">
                Για ποια πρωταθλήματα
              </p>
              <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                {leagues.map((l, i) => {
                  const on = allLeagues || (leagueSel?.has(l.league_id) ?? false)
                  return (
                    <button key={l.league_id} onClick={() => toggleLeague(l.league_id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3.5 text-left
                        ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                      {l.logo_url
                        ? <img src={l.logo_url} alt="" className="w-5 h-5 object-contain" />
                        : <span className="text-base">🏆</span>}
                      <span className="flex-1 text-[14px] font-semibold text-chalk truncate">{l.name}</span>
                      <Switch on={on} />
                    </button>
                  )
                })}
              </div>
              <p className="text-[10.5px] text-off mt-2 px-1">
                {allLeagues ? 'Λαμβάνεις από όλα τα πρωταθλήματα.' : 'Λαμβάνεις μόνο από τα επιλεγμένα.'}
              </p>
            </div>
          )}

          <button onClick={save} disabled={saving}
            className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
              text-white font-extrabold text-[15px] disabled:opacity-50
              shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
        </div>
      )}
    </>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`w-[42px] h-[25px] rounded-full p-[3px] shrink-0 transition-colors
      ${on ? 'bg-brand' : 'bg-chalk/[0.12]'}`}>
      <span className={`block w-[19px] h-[19px] rounded-full bg-white transition-transform
        ${on ? 'translate-x-[17px]' : ''}`} />
    </span>
  )
}

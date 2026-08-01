'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loading, Empty, FieldBadge } from '@/app/ui'
import { athensDateKey, fmtDay, fmtTime } from '@/lib/time'
import toast from 'react-hot-toast'

type Kind = 'referee' | 'photographer' | 'social'
const KIND_META: Record<Kind, { title: string; icon: string; accent: string }> = {
  referee:      { title: 'Referee',      icon: '🟨', accent: '#F2C230' },
  photographer: { title: 'Φωτογράφος',   icon: '📷', accent: '#3aa0ff' },
  social:       { title: 'Social Media', icon: '📱', accent: '#e0176b' },
}
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const todayKey = () => athensDateKey(new Date().toISOString())
const eur = (n: number) => `${n % 1 === 0 ? n : n.toFixed(2)}€`

export default function StaffCard() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const type = String(params.type)              // 'speaker' | 'member'
  const id = String(params.id)
  const personType: 'speaker' | 'staff' = type === 'speaker' ? 'speaker' : 'staff'

  const [load, setLoad] = useState(true)
  const [tab, setTab] = useState<'info' | 'schedule'>('info')
  const [name, setName] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind | null>(null)
  const [days, setDays] = useState<{ key: string; label: string; matches: any[] }[]>([])
  const [pay, setPay] = useState<Record<string, string>>({})   // day → amount
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayKey())
  const [busyName, setBusyName] = useState(false)
  // Χειροκίνητη πληρωμή (οποιαδήποτε ημερομηνία, ακόμη & προηγούμενη)
  const [mDay, setMDay] = useState(todayKey())
  const [mAmount, setMAmount] = useState('')

  async function fetchAll() {
    // 1) το άτομο
    let personName = '', personEmail: string | null = null, personKind: Kind | null = null
    if (personType === 'speaker') {
      const { data } = await supabase.from('profiles').select('full_name, email').eq('id', id).single()
      personName = data?.full_name || data?.email || '—'; personEmail = data?.email ?? null
    } else {
      const { data } = await supabase.from('staff').select('name, kind').eq('id', id).single()
      personName = data?.name || '—'; personKind = (data?.kind as Kind) ?? null
    }
    setName(personName); setEmail(personEmail); setKind(personKind)

    // 2) οι αγώνες του
    const SELECT = `match_id, match_date, field, match_status,
      team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url), league:league_id(name)`
    let list: any[] = []
    if (personType === 'speaker') {
      const { data } = await supabase.from('matches').select(SELECT).eq('speaker_id', id)
      list = data ?? []
    } else if (personKind === 'referee') {
      const { data } = await supabase.from('matches').select(SELECT).eq('referee_id', id)
      list = data ?? []
    } else if (personKind) {
      // φωτογράφος/social → τα ματς των ημερών που είναι ανατεθειμένος
      const { data: ds } = await supabase.from('day_staff')
        .select('day').eq('role', personKind).eq('staff_id', id)
      const dayset = new Set((ds ?? []).map(x => x.day))
      if (dayset.size) {
        const { data } = await supabase.from('matches').select(SELECT).not('match_date', 'is', null)
        list = (data ?? []).filter(m => dayset.has(athensDateKey(m.match_date)))
      }
    }
    // ομαδοποίηση ανά μέρα
    const byDay = new Map<string, any[]>()
    for (const m of list) {
      if (!m.match_date) continue
      const k = athensDateKey(m.match_date)
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(m)
    }
    setDays([...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, ms]) => ({
      key, label: fmtDay(ms[0].match_date),
      matches: ms.sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? '')),
    })))

    // 3) πληρωμές
    const { data: pays } = await supabase.from('staff_payments')
      .select('day, amount').eq('person_type', personType).eq('person_id', id)
    const pmap: Record<string, string> = {}
    for (const p of pays ?? []) pmap[p.day] = String(p.amount)
    setPay(pmap)
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [id, type])

  async function commitPay(day: string, raw: string) {
    const v = raw.replace(',', '.').trim()
    const num = parseFloat(v)
    if (!v || isNaN(num) || num === 0) {
      await supabase.from('staff_payments').delete()
        .eq('person_type', personType).eq('person_id', id).eq('day', day)
      setPay(prev => { const n = { ...prev }; delete n[day]; return n })
      return
    }
    const { error } = await supabase.from('staff_payments')
      .upsert({ person_type: personType, person_id: id, day, amount: num },
        { onConflict: 'person_type,person_id,day' })
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    setPay(prev => ({ ...prev, [day]: String(num) }))
  }

  const total = useMemo(() => {
    let s = 0
    for (const [day, v] of Object.entries(pay)) {
      if (day >= from && day <= to) { const n = parseFloat(v); if (!isNaN(n)) s += n }
    }
    return s
  }, [pay, from, to])

  async function saveName() {
    if (!name.trim()) return toast.error('Γράψε όνομα')
    setBusyName(true)
    const { error } = personType === 'speaker'
      ? await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', id)
      : await supabase.from('staff').update({ name: name.trim() }).eq('id', id)
    setBusyName(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Αποθηκεύτηκε')
  }
  async function changeKind(k: Kind) {
    const { error } = await supabase.from('staff').update({ kind: k }).eq('id', id)
    if (error) return toast.error('Δεν άλλαξε')
    setKind(k); toast.success('Ενημερώθηκε'); fetchAll()
  }
  async function removePerson() {
    if (!confirm('Σίγουρα;')) return
    const { error } = personType === 'speaker'
      ? await supabase.from('profiles').update({ role: 'viewer' }).eq('id', id)
      : await supabase.from('staff').delete().eq('id', id)
    if (error) return toast.error('Απέτυχε')
    toast.success('Έγινε'); router.push('/admin/staff')
  }

  if (load) return <Loading />

  const accent = kind ? KIND_META[kind].accent : '#FF7A2F'
  const roleLabel = personType === 'speaker' ? 'Speaker' : (kind ? KIND_META[kind].title : '—')
  const roleIcon = personType === 'speaker' ? '🎙' : (kind ? KIND_META[kind].icon : '👤')

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Link href="/admin/staff" className="text-[12px] text-dim font-bold active:opacity-70">‹ Προσωπικό</Link>

      {/* Κεφαλίδα */}
      <div className="flex items-center gap-3 mt-3 mb-4">
        <div className="w-12 h-12 rounded-full grid place-items-center text-lg font-extrabold shrink-0"
          style={{ background: `${accent}22`, color: accent }}>
          {(name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-chalk truncate">{name}</h1>
          <p className="text-[11px] font-bold" style={{ color: accent }}>{roleIcon} {roleLabel}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-turf rounded-xl p-[3px] mb-4 border border-chalk/[0.05]">
        {([['info', 'Στοιχεία'], ['schedule', 'Πρόγραμμα']] as const).map(([id2, lbl]) => (
          <button key={id2} onClick={() => setTab(id2)}
            className={`flex-1 py-2.5 rounded-lg text-[12.5px] font-bold transition-colors
              ${tab === id2 ? 'bg-brand text-chalk' : 'text-dim'}`}>{lbl}</button>
        ))}
      </div>

      {tab === 'info' ? (
        <div className="flex flex-col gap-4">
          {/* Στοιχεία */}
          <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5 flex flex-col gap-3">
            <div>
              <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5">ΟΝΟΜΑ</label>
              <div className="flex gap-2">
                <input value={name} onChange={e => setName(e.target.value)}
                  className="flex-1 min-w-0 bg-chalk/[0.04] rounded-xl px-3.5 py-2.5 text-chalk text-sm
                    outline-none border border-chalk/[0.07] focus:border-lit/50" />
                <button onClick={saveName} disabled={busyName}
                  className="px-4 rounded-xl bg-brand text-white text-[12.5px] font-extrabold disabled:opacity-50">
                  {busyName ? '…' : 'ΟΚ'}
                </button>
              </div>
            </div>
            {email && <p className="text-[11.5px] text-dim">✉️ {email}</p>}
            {personType === 'staff' && kind && (
              <div>
                <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5">ΚΑΤΗΓΟΡΙΑ</label>
                <div className="flex gap-1.5">
                  {(Object.keys(KIND_META) as Kind[]).map(k => (
                    <button key={k} onClick={() => changeKind(k)}
                      className={`flex-1 py-2 rounded-lg text-[11px] font-bold border
                        ${kind === k ? 'bg-brand/20 border-brand/50 text-chalk' : 'bg-chalk/[0.04] border-chalk/[0.06] text-dim'}`}>
                      {KIND_META[k].icon} {KIND_META[k].title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={removePerson}
              className="self-start px-3 py-2 rounded-lg bg-danger/15 border border-danger/30
                text-danger text-[11.5px] font-bold">
              {personType === 'speaker' ? 'Αφαίρεση από Speaker' : 'Διαγραφή'}
            </button>
          </div>

          {/* Πληρωμές — σύνολο σε περίοδο */}
          <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5 flex flex-col gap-3">
            <p className="text-[12.5px] font-extrabold text-chalk">💶 Πληρωμές</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[130px]">
                <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1">ΑΠΟ</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="w-full bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px]
                    outline-none border border-chalk/[0.07]" />
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1">ΕΩΣ</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="w-full bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px]
                    outline-none border border-chalk/[0.07]" />
              </div>
            </div>
            <div className="flex items-center justify-between bg-chalk/[0.04] rounded-xl px-4 py-3">
              <span className="text-[12px] font-bold text-silver">Σύνολο περιόδου</span>
              <span className="text-[22px] font-extrabold text-lit tnum">{eur(total)}</span>
            </div>

            {/* Προσθήκη πληρωμής σε οποιαδήποτε ημερομηνία */}
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={mDay} onChange={e => setMDay(e.target.value)}
                className="bg-chalk/[0.04] rounded-lg px-2.5 py-2 text-chalk text-[12px]
                  outline-none border border-chalk/[0.07]" />
              <div className="flex items-center bg-chalk/[0.04] rounded-lg border border-chalk/[0.07] px-2 w-[90px]">
                <input inputMode="decimal" value={mAmount} onChange={e => setMAmount(e.target.value)} placeholder="ποσό"
                  className="w-full bg-transparent py-2 text-chalk text-[13px] font-bold tnum outline-none placeholder:text-off" />
                <span className="text-dim text-[11px]">€</span>
              </div>
              <button onClick={async () => {
                if (!mAmount.trim()) return toast.error('Γράψε ποσό')
                await commitPay(mDay, mAmount); setMAmount(''); toast.success('Καταχωρήθηκε')
              }}
                className="px-3.5 py-2 rounded-lg bg-brand text-white text-[12.5px] font-extrabold">+ Πληρωμή</button>
            </div>

            {/* Όλες οι πληρωμές */}
            {Object.keys(pay).length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {Object.entries(pay).sort((a, b) => b[0].localeCompare(a[0])).map(([day, amt]) => (
                  <div key={day} className="flex items-center gap-2 py-1.5 border-t border-chalk/[0.05]">
                    <span className="text-[11px] text-dim tnum shrink-0 w-[86px]">{day}</span>
                    <span className="flex-1" />
                    <span className="text-[13px] font-extrabold text-lit tnum">{eur(Number(amt))}</span>
                    <button onClick={() => commitPay(day, '')} className="text-danger text-[12px] px-1 shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Πρόγραμμα — στυλ θεατή, με πληρωμή ανά μέρα */
        <div className="flex flex-col gap-4">
          {!days.length ? (
            <Empty>Δεν έχει αγώνες.</Empty>
          ) : days.map(d => (
            <div key={d.key}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-lit">
                  {d.label} · {d.matches.length} αγ.
                </p>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] text-dim font-bold">Πληρωμή</span>
                  <input inputMode="decimal" defaultValue={pay[d.key] ?? ''}
                    onBlur={e => commitPay(d.key, e.target.value)}
                    placeholder="0"
                    className={`w-[68px] rounded-lg px-2 py-1.5 text-right text-[13px] font-extrabold tnum
                      outline-none border ${pay[d.key]
                        ? 'bg-lit/[0.12] border-lit/40 text-lit'
                        : 'bg-chalk/[0.04] border-chalk/[0.07] text-chalk'}`} />
                  <span className="text-[12px] text-dim">€</span>
                </div>
              </div>
              <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                {d.matches.map((m, i) => {
                  const live = m.match_status === 'Live'
                  const done = ['Played', 'Forfeit'].includes(m.match_status)
                  return (
                    <Link key={m.match_id} href={`/match/${m.match_id}`}
                      className={`flex items-center gap-2.5 px-3 py-2.5 active:bg-[#1C1C22]
                        ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                      <span className="text-[13px] font-extrabold text-chalk tnum w-[46px] shrink-0">
                        {fmtTime(m.match_date)}
                      </span>
                      {m.field
                        ? <div className="shrink-0"><FieldBadge field={m.field} size="xs" /></div>
                        : <span className="w-[70px] shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-chalk truncate">
                          {m.team_a_data?.name} <span className="text-dim">–</span> {m.team_b_data?.name}
                        </p>
                        {m.league?.name && <p className="text-[9.5px] text-dim truncate">{m.league.name}</p>}
                      </div>
                      {live ? <span className="text-[8.5px] font-extrabold text-live shrink-0">LIVE</span>
                        : done ? <span className="text-[8.5px] font-extrabold text-dim shrink-0">ΤΕΛ</span>
                        : <span className="text-dim text-xs shrink-0">›</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

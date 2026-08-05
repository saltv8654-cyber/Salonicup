'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { athensDateKey } from '@/lib/time'
import toast from 'react-hot-toast'

type Rate = { id: string; effective_from: string; fee_8x8: number; fee_7x7: number; field_cost: number }
type Expense = { id: string; day: string; label: string; amount: number }
type Lg = { league_id: string; name: string; format: string }

const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const todayKey = () => athensDateKey(new Date().toISOString())
const eur = (n: number) => `${n % 1 === 0 ? n : n.toFixed(2)}€`

export default function AdminFinance() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayKey())

  const [rates, setRates] = useState<Rate[]>([])
  const [leagues, setLeagues] = useState<Lg[]>([])
  const [matches, setMatches] = useState<{ match_date: string; league_id: string }[]>([])
  const [pays, setPays] = useState<{ day: string; amount: number }[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [showSettings, setShowSettings] = useState(false)
  // Συμμετοχές ομάδων
  const [teams, setTeams] = useState<{ team_id: string; name: string; league_id: string; fee_paid: boolean }[]>([])
  const [partFee, setPartFee] = useState('40')
  const [showFees, setShowFees] = useState(true)

  async function fetchAll() {
    const [r, l, m, p, e, t, s] = await Promise.all([
      supabase.from('finance_rates').select('*').order('effective_from', { ascending: true }),
      supabase.from('leagues').select('league_id, name, format').order('sort_order'),
      supabase.from('matches').select('match_date, league_id')
        .in('match_status', ['Played', 'Live']).not('match_date', 'is', null),
      supabase.from('staff_payments').select('day, amount'),
      supabase.from('expenses').select('*').order('day', { ascending: false }),
      supabase.from('teams').select('team_id, name, league_id, fee_paid').eq('active', true).order('name'),
      supabase.from('app_settings').select('participation_fee').eq('id', 1).maybeSingle(),
    ])
    setRates(r.data ?? [])
    setLeagues(l.data ?? [])
    setMatches(m.data ?? [])
    setPays(p.data ?? [])
    setExpenses(e.data ?? [])
    setTeams(t.data ?? [])
    if (s.data?.participation_fee != null) setPartFee(String(s.data.participation_fee))
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [])

  async function toggleTeamPaid(id: string, paid: boolean) {
    const { error } = await supabase.from('teams').update({ fee_paid: paid }).eq('team_id', id)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    setTeams(prev => prev.map(t => t.team_id === id ? { ...t, fee_paid: paid } : t))
  }
  async function savePartFee(v: string) {
    const n = parseFloat(v.replace(',', '.'))
    if (isNaN(n)) return
    await supabase.from('app_settings').upsert({ id: 1, participation_fee: n }, { onConflict: 'id' })
  }

  // Χρέωση που ίσχυε σε δεδομένη ημέρα
  function rateAt(day: string): Rate | null {
    const applic = rates.filter(r => r.effective_from <= day)
    if (applic.length) return applic[applic.length - 1]  // rates είναι ascending
    return rates[0] ?? null
  }
  const fmtMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const l of leagues) map[l.league_id] = l.format
    return map
  }, [leagues])

  // Υπολογισμοί περιόδου
  const calc = useMemo(() => {
    let inc = 0, field = 0, n8 = 0, n7 = 0, fee8sum = 0, fee7sum = 0, hosted = 0
    for (const m of matches) {
      const day = athensDateKey(m.match_date)
      if (day < from || day > to) continue
      const r = rateAt(day); if (!r) continue
      const fmt = fmtMap[m.league_id] ?? '8x8'
      const fee = fmt === '7x7' ? Number(r.fee_7x7) : Number(r.fee_8x8)
      inc += fee * 2
      field += Number(r.field_cost)
      hosted++
      if (fmt === '7x7') { n7++; fee7sum += fee * 2 } else { n8++; fee8sum += fee * 2 }
    }
    const salaries = pays.filter(p => p.day >= from && p.day <= to)
      .reduce((s, p) => s + Number(p.amount), 0)
    const other = expenses.filter(x => x.day >= from && x.day <= to)
      .reduce((s, x) => s + Number(x.amount), 0)
    const exp = field + salaries + other
    return { inc, field, salaries, other, exp, net: inc - exp, n8, n7, fee8sum, fee7sum, hosted }
  }, [matches, pays, expenses, rates, fmtMap, from, to])

  // ── Ενέργειες ──
  async function saveRate(id: string, patch: Partial<Rate>) {
    const { error } = await supabase.from('finance_rates').update(patch).eq('id', id)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    setRates(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from)))
  }
  async function addRate() {
    const last = rates[rates.length - 1]
    const { data, error } = await supabase.from('finance_rates').insert({
      effective_from: todayKey(),
      fee_8x8: last?.fee_8x8 ?? 65, fee_7x7: last?.fee_7x7 ?? 60, field_cost: last?.field_cost ?? 60,
    }).select().single()
    if (error) return toast.error(error.message)
    setRates(prev => [...prev, data as Rate].sort((a, b) => a.effective_from.localeCompare(b.effective_from)))
  }
  async function delRate(id: string) {
    if (rates.length <= 1) return toast.error('Χρειάζεται τουλάχιστον μία χρέωση')
    if (!confirm('Διαγραφή χρέωσης;')) return
    const { error } = await supabase.from('finance_rates').delete().eq('id', id)
    if (error) return toast.error('Απέτυχε')
    setRates(prev => prev.filter(r => r.id !== id))
  }
  async function setLeagueFormat(id: string, format: string) {
    const { error } = await supabase.from('leagues').update({ format }).eq('league_id', id)
    if (error) return toast.error('Δεν άλλαξε')
    setLeagues(prev => prev.map(l => l.league_id === id ? { ...l, format } : l))
  }
  async function addExpense(day: string, label: string, amount: number) {
    const { data, error } = await supabase.from('expenses')
      .insert({ day, label, amount }).select().single()
    if (error) return toast.error(error.message)
    setExpenses(prev => [data as Expense, ...prev])
  }
  async function delExpense(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return toast.error('Απέτυχε')
    setExpenses(prev => prev.filter(x => x.id !== id))
  }

  if (load) return <Loading />

  const num = (v: number) => (v % 1 === 0 ? String(v) : v.toFixed(2))

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <h1 className="text-lg font-extrabold text-chalk">Οικονομικά</h1>

      {/* Περίοδος */}
      <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5 flex items-center gap-2 flex-wrap">
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

      {/* Σύνοψη */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3 text-center">
          <p className="text-[9.5px] font-extrabold text-dim tracking-[0.1em] mb-1">ΕΣΟΔΑ</p>
          <p className="text-[18px] font-extrabold text-[#2FA84F] tnum leading-none">{eur(calc.inc)}</p>
        </div>
        <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3 text-center">
          <p className="text-[9.5px] font-extrabold text-dim tracking-[0.1em] mb-1">ΕΞΟΔΑ</p>
          <p className="text-[18px] font-extrabold text-[#D8483C] tnum leading-none">{eur(calc.exp)}</p>
        </div>
        <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3 text-center">
          <p className="text-[9.5px] font-extrabold text-dim tracking-[0.1em] mb-1">ΚΑΘΑΡΟ</p>
          <p className={`text-[18px] font-extrabold tnum leading-none ${calc.net >= 0 ? 'text-lit' : 'text-[#D8483C]'}`}>
            {eur(calc.net)}</p>
        </div>
      </div>

      {/* Ανάλυση εσόδων */}
      <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5">
        <p className="text-[12.5px] font-extrabold text-chalk mb-2.5">📈 Έσοδα · {calc.hosted} αγώνες</p>
        <Line label={`8×8 — ${calc.n8} αγ. (×2 ομάδες)`} value={eur(calc.fee8sum)} />
        <Line label={`7×7 — ${calc.n7} αγ. (×2 ομάδες)`} value={eur(calc.fee7sum)} />
        <div className="h-px bg-chalk/[0.06] my-2" />
        <Line label="Σύνολο εσόδων" value={eur(calc.inc)} bold color="#2FA84F" />
      </div>

      {/* Ανάλυση εξόδων */}
      <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5">
        <p className="text-[12.5px] font-extrabold text-chalk mb-2.5">📉 Έξοδα</p>
        <Line label={`Γήπεδα — ${calc.hosted} αγώνες`} value={eur(calc.field)} />
        <Line label="Μισθοί προσωπικού" value={eur(calc.salaries)} />
        <Line label="Λοιπά έξοδα" value={eur(calc.other)} />
        <div className="h-px bg-chalk/[0.06] my-2" />
        <Line label="Σύνολο εξόδων" value={eur(calc.exp)} bold color="#D8483C" />
      </div>

      {/* Λοιπά έξοδα — καταχώρηση */}
      <OtherExpenses list={expenses.filter(x => x.day >= from && x.day <= to)}
        onAdd={addExpense} onDel={delExpense} />

      {/* Συμμετοχές ομάδων (ανά πρωτάθλημα) */}
      {(() => {
        const fee = parseFloat(partFee.replace(',', '.')) || 0
        const paidCount = teams.filter(t => t.fee_paid).length
        return (
          <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5">
            <button onClick={() => setShowFees(v => !v)} className="w-full flex items-center justify-between">
              <span className="text-[12.5px] font-extrabold text-chalk">🎟 Συμμετοχές ομάδων</span>
              <span className="text-dim text-[12px]">{showFees ? '▾' : '▸'}</span>
            </button>

            <div className="flex items-center justify-between gap-2 mt-3 bg-chalk/[0.04] rounded-xl px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-silver">Συμμετοχή / ομάδα</span>
                <div className="flex items-center bg-chalk/[0.05] rounded-lg border border-chalk/[0.07] px-2 w-[80px]">
                  <input inputMode="decimal" value={partFee}
                    onChange={e => setPartFee(e.target.value)} onBlur={e => savePartFee(e.target.value)}
                    className="w-full bg-transparent py-1.5 text-chalk text-[13px] font-bold tnum outline-none" />
                  <span className="text-dim text-[11px]">€</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[15px] font-extrabold text-[#2FA84F] tnum leading-none">{eur(paidCount * fee)}</p>
                <p className="text-[10px] text-dim mt-0.5">{paidCount}/{teams.length} πλήρωσαν · υπόλοιπο {eur((teams.length - paidCount) * fee)}</p>
              </div>
            </div>

            {showFees && (
              <div className="flex flex-col gap-4 mt-3">
                {leagues.filter(l => teams.some(t => t.league_id === l.league_id)).map(l => {
                  const lteams = teams.filter(t => t.league_id === l.league_id)
                  const paid = lteams.filter(t => t.fee_paid).length
                  return (
                    <div key={l.league_id}>
                      <div className="flex items-center gap-2 mb-2 px-0.5">
                        <span className="text-[12.5px] font-extrabold text-lit">{l.name}</span>
                        <span className="text-[10px] text-dim font-bold tnum">{paid}/{lteams.length} · {eur(paid * fee)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {lteams.map(t => (
                          <button key={t.team_id} onClick={() => toggleTeamPaid(t.team_id, !t.fee_paid)}
                            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 border active:opacity-80
                              ${t.fee_paid ? 'bg-[#2FA84F]/[0.12] border-[#2FA84F]/40' : 'bg-chalk/[0.03] border-chalk/[0.06]'}`}>
                            <span className={`w-6 h-6 rounded-md grid place-items-center text-[13px] font-extrabold shrink-0
                              ${t.fee_paid ? 'bg-[#2FA84F] text-white' : 'bg-chalk/[0.08] text-dim'}`}>
                              {t.fee_paid ? '✓' : ''}
                            </span>
                            <span className="flex-1 text-left text-[13px] font-bold text-chalk truncate">{t.name}</span>
                            <span className={`text-[11.5px] font-extrabold ${t.fee_paid ? 'text-[#2FA84F]' : 'text-dim'}`}>
                              {t.fee_paid ? 'Πλήρωσε' : 'Εκκρεμεί'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Ρυθμίσεις χρεώσεων */}
      <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5">
        <button onClick={() => setShowSettings(v => !v)}
          className="w-full flex items-center justify-between">
          <span className="text-[12.5px] font-extrabold text-chalk">⚙️ Χρεώσεις & μορφή πρωταθλημάτων</span>
          <span className="text-dim text-[12px]">{showSettings ? '▾' : '▸'}</span>
        </button>

        {showSettings && (
          <div className="mt-3 flex flex-col gap-4">
            {/* Χρεώσεις με ισχύ από */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-extrabold text-silver">Χρεώσεις (ισχύς από ημερομηνία)</p>
                <button onClick={addRate}
                  className="px-2.5 py-1.5 rounded-lg bg-chalk/[0.06] border border-chalk/[0.08]
                    text-[10.5px] font-extrabold text-silver">+ Νέα</button>
              </div>
              <p className="text-[10px] text-off mb-2">
                Άλλαξε τιμές από συγκεκριμένη μέρα (π.χ. Σεπτέμβρη) χωρίς να χαλάσουν τα παλιά.
              </p>
              <div className="flex flex-col gap-2">
                {rates.map(r => (
                  <div key={r.id} className="bg-chalk/[0.03] rounded-lg p-2.5 flex flex-col gap-2
                    border border-chalk/[0.05]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-dim font-bold shrink-0">Από</span>
                      <input type="date" defaultValue={r.effective_from}
                        onBlur={e => saveRate(r.id, { effective_from: e.target.value })}
                        className="flex-1 bg-chalk/[0.04] rounded-md px-2 py-1.5 text-chalk text-[12px]
                          outline-none border border-chalk/[0.07]" />
                      <button onClick={() => delRate(r.id)}
                        className="text-danger text-[13px] px-1.5 shrink-0">✕</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <RateInput label="8×8 / ομ." def={num(r.fee_8x8)}
                        onSave={v => saveRate(r.id, { fee_8x8: v })} />
                      <RateInput label="7×7 / ομ." def={num(r.fee_7x7)}
                        onSave={v => saveRate(r.id, { fee_7x7: v })} />
                      <RateInput label="Γήπεδο" def={num(r.field_cost)}
                        onSave={v => saveRate(r.id, { field_cost: v })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Μορφή πρωταθλημάτων */}
            <div>
              <p className="text-[11px] font-extrabold text-silver mb-2">Μορφή πρωταθλημάτων</p>
              <div className="flex flex-col gap-1.5">
                {leagues.map(l => (
                  <div key={l.league_id} className="flex items-center gap-2 bg-chalk/[0.03] rounded-lg px-3 py-2
                    border border-chalk/[0.05]">
                    <span className="flex-1 min-w-0 text-[12px] font-bold text-chalk truncate">{l.name}</span>
                    {['8x8', '7x7'].map(f => (
                      <button key={f} onClick={() => setLeagueFormat(l.league_id, f)}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-extrabold border
                          ${l.format === f ? 'bg-brand/25 border-brand/50 text-chalk' : 'bg-chalk/[0.04] border-chalk/[0.06] text-dim'}`}>
                        {f.replace('x', '×')}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Line({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-[12px] ${bold ? 'font-extrabold text-chalk' : 'text-silver'}`}>{label}</span>
      <span className={`text-[13px] tnum ${bold ? 'font-extrabold' : 'font-bold text-chalk'}`}
        style={color ? { color } : undefined}>{value}</span>
    </div>
  )
}

function RateInput({ label, def, onSave }: { label: string; def: string; onSave: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[8px] font-extrabold text-dim tracking-[0.08em] mb-1">{label}</label>
      <div className="flex items-center bg-chalk/[0.04] rounded-md border border-chalk/[0.07] px-2">
        <input inputMode="decimal" defaultValue={def}
          onBlur={e => { const n = parseFloat(e.target.value.replace(',', '.')); if (!isNaN(n)) onSave(n) }}
          className="w-full bg-transparent py-1.5 text-chalk text-[13px] font-bold tnum outline-none" />
        <span className="text-dim text-[11px]">€</span>
      </div>
    </div>
  )
}

function OtherExpenses({ list, onAdd, onDel }: {
  list: Expense[]
  onAdd: (day: string, label: string, amount: number) => void
  onDel: (id: string) => void
}) {
  const [day, setDay] = useState(todayKey())
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')

  function add() {
    const n = parseFloat(amount.replace(',', '.'))
    if (!label.trim() || isNaN(n)) return toast.error('Συμπλήρωσε περιγραφή & ποσό')
    onAdd(day, label.trim(), n)
    setLabel(''); setAmount('')
  }

  return (
    <div className="bg-turf rounded-xl border border-chalk/[0.05] p-3.5">
      <p className="text-[12.5px] font-extrabold text-chalk mb-2.5">🧾 Λοιπά έξοδα</p>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input type="date" value={day} onChange={e => setDay(e.target.value)}
          className="bg-chalk/[0.04] rounded-lg px-2.5 py-2 text-chalk text-[12px]
            outline-none border border-chalk/[0.07]" />
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Περιγραφή"
          className="flex-1 min-w-[110px] bg-chalk/[0.04] rounded-lg px-3 py-2 text-chalk text-[13px]
            outline-none border border-chalk/[0.07] placeholder:text-off" />
        <div className="flex items-center bg-chalk/[0.04] rounded-lg border border-chalk/[0.07] px-2 w-[84px]">
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
            className="w-full bg-transparent py-2 text-chalk text-[13px] font-bold tnum outline-none" />
          <span className="text-dim text-[11px]">€</span>
        </div>
        <button onClick={add}
          className="px-3.5 py-2 rounded-lg bg-brand text-white text-[12.5px] font-extrabold">+</button>
      </div>
      {list.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          {list.map(x => (
            <div key={x.id} className="flex items-center gap-2 py-1.5 border-t border-chalk/[0.05]">
              <span className="text-[10px] text-dim tnum shrink-0 w-[74px]">{x.day}</span>
              <span className="flex-1 min-w-0 text-[12px] text-chalk truncate">{x.label}</span>
              <span className="text-[12.5px] font-bold text-[#D8483C] tnum shrink-0">{eur(Number(x.amount))}</span>
              <button onClick={() => onDel(x.id)} className="text-danger text-[12px] px-1 shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

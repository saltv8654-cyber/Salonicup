'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Field, Select, SaveBtn } from '../ui'
import toast from 'react-hot-toast'
import type { League } from '@/lib/types'

/** Διπλός γύρος (circle method). Επιστρέφει πίνακα γύρων με ζεύγη [a,b]. */
function roundRobin(ids: string[]): [string, string][][] {
  const arr = ids.slice()
  if (arr.length % 2 === 1) arr.push('BYE')
  const n = arr.length
  let order = arr.slice()
  const rounds: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = order[i], b = order[n - 1 - i]
      if (a !== 'BYE' && b !== 'BYE') pairs.push([a, b])
    }
    rounds.push(pairs)
    order = [order[0], order[n - 1], ...order.slice(1, n - 1)]
  }
  return rounds
}

export default function AdminFixtures() {
  const supabase = createClient()
  const [leagues, setLeagues] = useState<League[]>([])
  const [load, setLoad] = useState(true)

  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [newName, setNewName] = useState('Εικονικό Πρωτάθλημα')
  const [count, setCount] = useState('8')
  const [leagueId, setLeagueId] = useState('')

  const today = new Date()
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(iso)
  const [times, setTimes] = useState('18:00,19:00,20:00,21:00')
  const [fields, setFields] = useState('Γήπ. 4,Γήπ. 3,Γήπ. 5')
  const [daysPer, setDaysPer] = useState('7')
  const [double, setDouble] = useState(true)

  const [busy, setBusy] = useState(false)
  const [doneInfo, setDoneInfo] = useState<{ leagueId: string; matches: number } | null>(null)

  useEffect(() => {
    supabase.from('leagues').select('*').order('sort_order')
      .then(({ data }) => { setLeagues(data ?? []); setLoad(false) })
  }, [])

  async function generate() {
    setDoneInfo(null)
    const timeList = times.split(',').map(s => s.trim()).filter(Boolean)
    const fieldList = fields.split(',').map(s => s.trim()).filter(Boolean)
    if (!timeList.length) return toast.error('Βάλε ώρες')
    if (!fieldList.length) return toast.error('Βάλε γήπεδα')
    if (!startDate) return toast.error('Βάλε ημερομηνία έναρξης')
    const gap = Math.max(1, parseInt(daysPer) || 7)

    setBusy(true)
    try {
      let lid = leagueId
      let teamIds: string[] = []

      if (mode === 'new') {
        const n = parseInt(count) || 0
        if (n < 2) throw new Error('Χρειάζονται τουλάχιστον 2 ομάδες')
        if (!newName.trim()) throw new Error('Βάλε όνομα πρωταθλήματος')

        const { data: lg, error: e1 } = await supabase.from('leagues')
          .insert({ name: newName.trim(), sort_order: 99, active: true })
          .select('league_id').single()
        if (e1 || !lg) throw new Error(e1?.message || 'Δεν δημιουργήθηκε το πρωτάθλημα')
        lid = lg.league_id

        const teamRows = Array.from({ length: n }, (_, i) => ({ league_id: lid, name: `Ομάδα ${i + 1}` }))
        const { error: e2 } = await supabase.from('teams').insert(teamRows)
        if (e2) throw new Error(e2.message)

        const { data: ts } = await supabase.from('teams')
          .select('team_id, name').eq('league_id', lid)
        teamIds = (ts ?? [])
          .slice()
          .sort((a, b) => (parseInt(a.name.replace(/\D/g, '')) || 0) - (parseInt(b.name.replace(/\D/g, '')) || 0))
          .map(t => t.team_id)
      } else {
        if (!lid) throw new Error('Διάλεξε πρωτάθλημα')
        const { data: ts } = await supabase.from('teams')
          .select('team_id, name').eq('league_id', lid).eq('active', true).order('name')
        teamIds = (ts ?? []).map(t => t.team_id)
        if (teamIds.length < 2) throw new Error('Το πρωτάθλημα δεν έχει αρκετές ομάδες')
      }

      // Γύροι
      const leg1 = roundRobin(teamIds)
      const leg2 = double ? leg1.map(rnd => rnd.map(([a, b]) => [b, a] as [string, string])) : []
      const allRounds = [...leg1, ...leg2]

      // Ημερομηνία έναρξης (τοπική)
      const [Y, M, D] = startDate.split('-').map(Number)

      const rows: any[] = []
      allRounds.forEach((rnd, ri) => {
        const dayOffset = ri * gap
        rnd.forEach(([a, b], mi) => {
          const [hh, mm] = timeList[mi % timeList.length].split(':').map(Number)
          const dt = new Date(Y, M - 1, D + dayOffset, hh || 0, mm || 0)
          const field = fieldList[(mi + ri) % fieldList.length] // δίκαιη περιστροφή γηπέδων
          rows.push({
            league_id: lid, round: ri + 1,
            match_date: dt.toISOString(), field,
            team_a: a, team_b: b, match_status: 'Scheduled',
          })
        })
      })

      // Εισαγωγή σε παρτίδες
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from('matches').insert(rows.slice(i, i + 100))
        if (error) throw new Error(error.message)
      }

      setDoneInfo({ leagueId: lid, matches: rows.length })
      toast.success(`Δημιουργήθηκαν ${rows.length} αγώνες`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Κάτι πήγε στραβά')
    } finally {
      setBusy(false)
    }
  }

  if (load) return <Loading />

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-extrabold text-chalk">Γεννήτρια αγωνιστικών</h1>
        <p className="text-[11.5px] text-dim mt-1">
          Δημιουργεί αυτόματα πλήρες πρόγραμμα (διπλός γύρος) με ημερομηνίες, ώρες και γήπεδα.
        </p>
      </div>

      {/* Λειτουργία */}
      <div className="flex gap-1.5">
        <TabBtn on={mode === 'new'} onClick={() => setMode('new')}>Νέο (Ομάδα 1…Ν)</TabBtn>
        <TabBtn on={mode === 'existing'} onClick={() => setMode('existing')}>Υπάρχον</TabBtn>
      </div>

      <div className="bg-turf rounded-xl p-4 border border-chalk/[0.05] flex flex-col gap-3">
        {mode === 'new' ? (
          <>
            <Field label="ΟΝΟΜΑ ΠΡΩΤΑΘΛΗΜΑΤΟΣ" value={newName} onChange={setNewName} />
            <Field label="ΑΡΙΘΜΟΣ ΟΜΑΔΩΝ" value={count} onChange={setCount} numeric />
            <p className="text-[10.5px] text-off -mt-1">
              Θα ονομαστούν «Ομάδα 1»…«Ομάδα {parseInt(count) || 0}» — τις μετονομάζεις μετά.
            </p>
          </>
        ) : (
          <Select label="ΠΡΩΤΑΘΛΗΜΑ" value={leagueId} onChange={setLeagueId}
            options={leagues.map(l => ({ value: l.league_id, label: l.name }))} />
        )}
      </div>

      <div className="bg-turf rounded-xl p-4 border border-chalk/[0.05] flex flex-col gap-3">
        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΗΜΕΡΟΜΗΝΙΑ ΕΝΑΡΞΗΣ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
              outline-none border border-chalk/[0.07] focus:border-lit/50" />
        </div>
        <Field label="ΩΡΕΣ (χωρισμένες με κόμμα)" value={times} onChange={setTimes} />
        <Field label="ΓΗΠΕΔΑ (χωρισμένα με κόμμα)" value={fields} onChange={setFields} />
        <Field label="ΜΕΡΕΣ ΑΝΑ ΑΓΩΝΙΣΤΙΚΗ" value={daysPer} onChange={setDaysPer} numeric />
        <label className="flex items-center gap-2.5 mt-1">
          <input type="checkbox" checked={double}
            onChange={e => setDouble(e.target.checked)}
            className="w-4 h-4 accent-[#E05B1F]" />
          <span className="text-[13px] text-silver font-semibold">Διπλός γύρος (κάθε ζευγάρι 2 φορές)</span>
        </label>
      </div>

      <SaveBtn busy={busy} onClick={generate} label="Δημιουργία αγωνιστικών" />

      {doneInfo && (
        <div className="bg-lit/[0.08] border border-lit/25 rounded-xl p-4 text-center">
          <p className="text-[13.5px] font-bold text-chalk mb-2">
            ✅ Δημιουργήθηκαν {doneInfo.matches} αγώνες
          </p>
          <div className="flex gap-2 justify-center">
            <Link href={`/standings?league=${doneInfo.leagueId}`}
              className="px-4 py-2 rounded-lg bg-turf border border-lit/25 text-lit text-[12px] font-bold">
              Βαθμολογία
            </Link>
            <Link href="/admin/matches"
              className="px-4 py-2 rounded-lg bg-turf border border-chalk/[0.08] text-silver text-[12px] font-bold">
              Στους αγώνες
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function TabBtn({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 py-2.5 rounded-xl text-[12.5px] font-bold border
        ${on ? 'bg-brand text-chalk border-lit' : 'bg-turf text-dim border-chalk/[0.06]'}`}>
      {children}
    </button>
  )
}

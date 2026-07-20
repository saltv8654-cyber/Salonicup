'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Field, Select, SaveBtn } from '../ui'
import toast from 'react-hot-toast'
import type { League } from '@/lib/types'

/** Διπλός/μονός γύρος (circle method). Επιστρέφει γύρους με ζεύγη [a,b]. */
function buildRounds(ids: string[], double: boolean): [string, string][][] {
  const arr = ids.slice()
  if (arr.length % 2 === 1) arr.push('BYE')
  const n = arr.length
  let order = arr.slice()
  const leg1: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = order[i], b = order[n - 1 - i]
      if (a !== 'BYE' && b !== 'BYE') pairs.push([a, b])
    }
    leg1.push(pairs)
    order = [order[0], order[n - 1], ...order.slice(1, n - 1)]
  }
  const leg2 = double ? leg1.map(rnd => rnd.map(([a, b]) => [b, a] as [string, string])) : []
  return [...leg1, ...leg2]
}

const DAY: Record<string, number> = { κυ: 0, δε: 1, τρ: 2, τε: 3, πε: 4, πα: 5, σα: 6 }
const parseDay = (tok: string) => {
  const t = tok.toLowerCase().slice(0, 2)
  return t in DAY ? DAY[t] : null
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const rotate = <T,>(a: T[], k: number) => a.map((_, i) => a[(i + k) % a.length])

// Ταυτότητα σαββατοκύριακου: Πεμ-Παρ-Σαβ-Κυρ της ίδιας εβδομάδας (Δευ–Κυρ) πέφτουν στο ίδιο id
function weekendId(date: Date): number {
  const sinceMon = (date.getDay() + 6) % 7 // Δευ=0 … Κυρ=6
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMon)
  return Math.round(monday.getTime() / 86400000)
}

interface LeagueState {
  id: string
  rounds: [string, string][][]
  rPtr: number
  remaining: [string, string][]
  weekLock: number
  roundWeek: number
  done: boolean
}

export default function AdminFixtures() {
  const supabase = createClient()
  const [leagues, setLeagues] = useState<League[]>([])
  const [load, setLoad] = useState(true)

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('Εικονικό Πρωτάθλημα')
  const [count, setCount] = useState('8')

  const today = new Date()
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(iso)
  const [fields, setFields] = useState('Γήπ. 4, Γήπ. 3')
  const [slotsText, setSlotsText] = useState(
    'Πεμ 22:00\nΠαρ 19:00, 20:30, 22:00\nΣαβ 17:30, 19:00, 20:30, 22:00\nΚυρ 17:30, 19:00, 20:30, 22:00'
  )
  // Σειρά προτεραιότητας (πάνω = γεμίζει πρώτο). Ό,τι λείπει → τελευταίο.
  const [priorText, setPriorText] = useState(
    'Πεμ 22:00\nΠαρ 20:30, 22:00\nΚυρ 19:00, 20:30, 22:00\nΣαβ 19:00, 20:30\nΠαρ 19:00\nΚυρ 17:30\nΣαβ 17:30, 22:00'
  )
  const [oneWeek, setOneWeek] = useState(true)
  const [double, setDouble] = useState(true)
  const [clearFirst, setClearFirst] = useState(false)
  const [venues, setVenues] = useState<{ venue_id: string; name: string }[]>([])
  const [venueId, setVenueId] = useState('')

  const [busy, setBusy] = useState(false)
  const [doneInfo, setDoneInfo] = useState<{ matches: number } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('leagues').select('*').order('sort_order'),
      supabase.from('venues').select('venue_id, name').order('name'),
    ]).then(([l, v]) => {
      setLeagues(l.data ?? [])
      setVenues(v.data ?? [])
      setLoad(false)
    })
  }, [])

  function parseSlots(): Record<number, { h: number; m: number }[]> {
    const byDow: Record<number, { h: number; m: number }[]> = {}
    for (const line of slotsText.split('\n')) {
      const parts = line.trim().split(/[\s,]+/).filter(Boolean)
      if (!parts.length) continue
      const dow = parseDay(parts[0])
      if (dow === null) continue
      const times = parts.slice(1).map(t => {
        const [h, m] = t.split(':').map(Number)
        return Number.isFinite(h) ? { h, m: m || 0 } : null
      }).filter(Boolean) as { h: number; m: number }[]
      if (times.length) byDow[dow] = (byDow[dow] ?? []).concat(times)
    }
    for (const k in byDow) byDow[+k].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))
    return byDow
  }

  // Χάρτης προτεραιότητας: `${dow}|${λεπτά}` → rank (μικρότερο = πιο νωρίς γεμίζει)
  function parsePriority(): Map<string, number> {
    const map = new Map<string, number>()
    let rank = 0
    for (const line of priorText.split('\n')) {
      const parts = line.trim().split(/[\s,]+/).filter(Boolean)
      if (parts.length < 2) continue
      const dow = parseDay(parts[0])
      if (dow === null) continue
      for (const t of parts.slice(1)) {
        const [h, m] = t.split(':').map(Number)
        if (Number.isFinite(h)) map.set(`${dow}|${h * 60 + (m || 0)}`, rank++)
      }
    }
    return map
  }

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function generate() {
    setDoneInfo(null)
    const fieldList = fields.split(',').map(s => s.trim()).filter(Boolean)
    if (!fieldList.length) return toast.error('Βάλε γήπεδα')
    if (!startDate) return toast.error('Βάλε ημερομηνία έναρξης')
    const byDow = parseSlots()
    if (!Object.keys(byDow).length) return toast.error('Δεν διάβασα μέρες/ώρες — έλεγξε τη μορφή')

    setBusy(true)
    try {
      // 1) Ποια πρωταθλήματα + ομάδες τους
      const targets: { id: string; teamIds: string[] }[] = []

      if (mode === 'new') {
        const n = parseInt(count) || 0
        if (n < 2) throw new Error('Χρειάζονται τουλάχιστον 2 ομάδες')
        if (!newName.trim()) throw new Error('Βάλε όνομα πρωταθλήματος')
        const { data: lg, error: e1 } = await supabase.from('leagues')
          .insert({ name: newName.trim(), sort_order: 99, active: true })
          .select('league_id').single()
        if (e1 || !lg) throw new Error(e1?.message || 'Δεν δημιουργήθηκε το πρωτάθλημα')
        const teamRows = Array.from({ length: n }, (_, i) => ({ league_id: lg.league_id, name: `Ομάδα ${i + 1}` }))
        const { error: e2 } = await supabase.from('teams').insert(teamRows)
        if (e2) throw new Error(e2.message)
        const { data: ts } = await supabase.from('teams').select('team_id, name').eq('league_id', lg.league_id)
        const ids = (ts ?? []).slice()
          .sort((a, b) => (parseInt(a.name.replace(/\D/g, '')) || 0) - (parseInt(b.name.replace(/\D/g, '')) || 0))
          .map(t => t.team_id)
        targets.push({ id: lg.league_id, teamIds: ids })
      } else {
        if (!selected.size) throw new Error('Διάλεξε τουλάχιστον ένα πρωτάθλημα')
        for (const lid of selected) {
          const { data: ts } = await supabase.from('teams')
            .select('team_id, name').eq('league_id', lid).eq('active', true).order('name')
          const ids = (ts ?? []).map(t => t.team_id)
          if (ids.length >= 2) targets.push({ id: lid, teamIds: ids })
        }
        if (!targets.length) throw new Error('Τα επιλεγμένα πρωταθλήματα δεν έχουν αρκετές ομάδες')
      }

      // 2) Προαιρετικό σβήσιμο υπαρχόντων ματς
      if (clearFirst) {
        for (const t of targets) {
          const { error } = await supabase.from('matches').delete().eq('league_id', t.id)
          if (error) throw new Error('Διαγραφή: ' + error.message)
        }
      }

      // 3) Κατάσταση ανά πρωτάθλημα
      const states: LeagueState[] = targets.map(t => {
        const rounds = buildRounds(t.teamIds, double)
        return { id: t.id, rounds, rPtr: 0, remaining: rounds[0]?.slice() ?? [], weekLock: 0, roundWeek: -1, done: (rounds[0]?.length ?? 0) === 0 }
      })
      const totalMatches = states.reduce((s, L) => s + L.rounds.reduce((a, r) => a + r.length, 0), 0)

      // 4) Κοινό ημερολόγιο slots — γέμισμα με interleaving, χωρίς συγκρούσεις
      const [Y, M, D] = startDate.split('-').map(Number)
      const start = new Date(Y, M - 1, D)
      const F = fieldList.length
      const rows: any[] = []
      const slotEntries: { iso: string; field: string }[] = [] // κάθε ώρα×γήπεδο (για ελεύθερα)
      let cursor = 0

      const allDone = () => states.every(L => L.done)

      // Υποψήφιες ώρες, ταξινομημένες ανά σαββατοκύριακο → προτεραιότητα → ώρα
      const prio = parsePriority()
      const cands: { iso: string; date: Date; week: number; rank: number; tmin: number }[] = []
      for (let dayOffset = 0; dayOffset < 500; dayOffset++) {
        const date = addDays(start, dayOffset)
        const times = byDow[date.getDay()]
        if (!times) continue
        const week = weekendId(date)
        for (const tm of times) {
          const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), tm.h, tm.m)
          const tmin = tm.h * 60 + tm.m
          cands.push({ iso: dt.toISOString(), date: dt, week, rank: prio.get(`${date.getDay()}|${tmin}`) ?? 999, tmin })
        }
      }
      cands.sort((a, b) => a.week - b.week || a.rank - b.rank || a.tmin - b.tmin)

      for (const c of cands) {
        if (allDone()) break
        const week = c.week
        const used = new Set<string>()
        // Κάθε γήπεδο αυτής της ώρας γίνεται slot (ελεύθερο ή με αγώνα)
        for (const f of fieldList) slotEntries.push({ iso: c.iso, field: f })

        for (let s = 0; s < F; s++) {
          const field = fieldList[s] // «καλό» πρώτο (Γήπ. 4) — μία ανοιχτή ώρα → στο καλό
          let placed = false
          for (let k = 0; k < states.length; k++) {
            const L = states[(cursor + k) % states.length]
            if (L.done) continue
            if (oneWeek) {
              // Η αγωνιστική δεν σπάει σε δύο σαββατοκύριακα + μία/ΠΣΚ
              if (L.roundWeek !== -1 && week !== L.roundWeek) continue
              if (L.roundWeek === -1 && week < L.weekLock) continue
            }
            const idx = L.remaining.findIndex(([a, b]) => !used.has(a) && !used.has(b))
            if (idx < 0) continue
            const [a, b] = L.remaining.splice(idx, 1)[0]
            if (oneWeek && L.roundWeek === -1) L.roundWeek = week
            rows.push({
              league_id: L.id, round: L.rPtr + 1,
              match_date: c.iso, field,
              team_a: a, team_b: b, match_status: 'Scheduled',
            })
            used.add(a); used.add(b)
            if (L.remaining.length === 0) {
              if (oneWeek) { L.weekLock = L.roundWeek + 7; L.roundWeek = -1 } // επόμενο σαββατοκύριακο
              if (L.rPtr < L.rounds.length - 1) { L.rPtr++; L.remaining = L.rounds[L.rPtr].slice() }
              else L.done = true
            }
            cursor++
            placed = true
            break
          }
          if (!placed) break // κανένα πρωτάθλημα δεν χωράει εδώ τώρα
        }
      }

      if (rows.length < totalMatches) {
        throw new Error(`Δεν επαρκούν τα slots (μπήκαν ${rows.length}/${totalMatches}). Βάλε περισσότερες μέρες/ώρες ή ξετσέκαρε «μία/εβδομάδα».`)
      }

      const inserted: any[] = []
      for (let i = 0; i < rows.length; i += 100) {
        const { data, error } = await supabase.from('matches')
          .insert(rows.slice(i, i + 100))
          .select('match_id, match_date, field')
        if (error) throw new Error(error.message)
        inserted.push(...(data ?? []))
      }

      // Δημιουργία slots (ελεύθερα γήπεδα) — μόνο αν επιλέχθηκε γήπεδο
      if (venueId && slotEntries.length) {
        // καθάρισε τυχόν παλιά μελλοντικά slots του γηπέδου
        await supabase.from('slots').delete()
          .eq('venue_id', venueId).gte('starts_at', start.toISOString())
        const key = (iso: string, f: string) => `${new Date(iso).getTime()}|${f}`
        const mMap = new Map<string, string>()
        for (const m of inserted) mMap.set(key(m.match_date, m.field), m.match_id)
        const slotRows = slotEntries.map(s => ({
          venue_id: venueId, field: s.field, starts_at: s.iso,
          match_id: mMap.get(key(s.iso, s.field)) ?? null,
        }))
        for (let i = 0; i < slotRows.length; i += 200) {
          const { error } = await supabase.from('slots')
            .upsert(slotRows.slice(i, i + 200), { onConflict: 'venue_id,field,starts_at' })
          if (error) throw new Error('Slots: ' + error.message)
        }
      }

      setDoneInfo({ matches: rows.length })
      toast.success(`Δημιουργήθηκαν ${rows.length} αγώνες${venueId ? ' + ελεύθερα γήπεδα' : ''}`)
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
          Προγραμματίζει πολλά πρωταθλήματα μαζί στα ίδια γήπεδα — χωρίς δύο ματς στο ίδιο γήπεδο-ώρα.
        </p>
      </div>

      <div className="flex gap-1.5">
        <TabBtn on={mode === 'existing'} onClick={() => setMode('existing')}>Υπάρχοντα (πολλά)</TabBtn>
        <TabBtn on={mode === 'new'} onClick={() => setMode('new')}>Νέο εικονικό</TabBtn>
      </div>

      <div className="bg-turf rounded-xl p-4 border border-chalk/[0.05] flex flex-col gap-3">
        {mode === 'existing' ? (
          <>
            <p className="text-[8.5px] font-extrabold text-dim tracking-[0.12em]">
              ΠΡΩΤΑΘΛΗΜΑΤΑ ΠΡΟΣ ΠΡΟΓΡΑΜΜΑΤΙΣΜΟ
            </p>
            <div className="flex flex-col gap-1.5">
              {leagues.map(l => {
                const on = selected.has(l.league_id)
                return (
                  <button key={l.league_id} onClick={() => toggle(l.league_id)}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-3 border text-left
                      ${on ? 'bg-lit/[0.10] border-lit/35' : 'bg-chalk/[0.03] border-chalk/[0.06]'}`}>
                    {l.logo_url
                      ? <img src={l.logo_url} alt="" className="w-6 h-6 object-contain" />
                      : <span className="text-lg">🏆</span>}
                    <span className="flex-1 text-[13.5px] font-semibold text-chalk truncate">{l.name}</span>
                    <span className={`w-5 h-5 rounded-md border grid place-items-center text-[11px]
                      ${on ? 'bg-brand border-lit text-white' : 'border-chalk/20 text-transparent'}`}>✓</span>
                  </button>
                )
              })}
            </div>
            <label className="flex items-center gap-2.5 mt-1">
              <input type="checkbox" checked={clearFirst}
                onChange={e => setClearFirst(e.target.checked)}
                className="w-4 h-4 accent-[#E05B1F]" />
              <span className="text-[12.5px] text-silver font-semibold">
                Σβήσε πρώτα τα υπάρχοντα ματς αυτών των πρωταθλημάτων
              </span>
            </label>
          </>
        ) : (
          <>
            <Field label="ΟΝΟΜΑ ΠΡΩΤΑΘΛΗΜΑΤΟΣ" value={newName} onChange={setNewName} />
            <Field label="ΑΡΙΘΜΟΣ ΟΜΑΔΩΝ" value={count} onChange={setCount} numeric />
            <p className="text-[10.5px] text-off -mt-1">
              Θα ονομαστούν «Ομάδα 1»…«Ομάδα {parseInt(count) || 0}».
            </p>
          </>
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

        <Field label="ΓΗΠΕΔΑ — ΠΑΡΑΛΛΗΛΑ (κόμμα· το 1ο = «καλό»)" value={fields} onChange={setFields} />

        <div>
          <Select label="ΓΗΠΕΔΟ ΓΙΑ «ΕΛΕΥΘΕΡΑ» (προαιρετικό)" value={venueId} onChange={setVenueId}
            options={venues.map(v => ({ value: v.venue_id, label: v.name }))} />
          <p className="text-[10px] text-off mt-1 pl-0.5">
            Αν το επιλέξεις, δημιουργούνται slots ώστε οι κενές ώρες να φαίνονται «ΕΛΕΥΘΕΡΟ» στους αρχηγούς.
          </p>
        </div>

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΜΕΡΕΣ & ΩΡΕΣ (μία γραμμή ανά μέρα)</label>
          <textarea value={slotsText} onChange={e => setSlotsText(e.target.value)} rows={5}
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-[13px]
              font-mono leading-relaxed outline-none border border-chalk/[0.07] focus:border-lit/50" />
          <p className="text-[10px] text-off mt-1.5">
            Μέρες: Δευ Τρι Τετ Πεμ Παρ Σαβ Κυρ. Η αγωνιστική μπορεί να απλώνεται σε πολλές μέρες.
          </p>
        </div>

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΠΡΟΤΕΡΑΙΟΤΗΤΑ ΩΡΩΝ (πάνω = γεμίζει πρώτο)</label>
          <textarea value={priorText} onChange={e => setPriorText(e.target.value)} rows={5}
            className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-[13px]
              font-mono leading-relaxed outline-none border border-chalk/[0.07] focus:border-lit/50" />
          <p className="text-[10px] text-off mt-1.5">
            Πρώτα μπαίνουν οι κορυφαίες ώρες· ό,τι λείπει πάει τελευταίο. Το «καλό» γήπεδο (1ο στη λίστα) προτιμάται όταν υπάρχει ελεύθερη ώρα.
          </p>
        </div>

        <label className="flex items-center gap-2.5 mt-1">
          <input type="checkbox" checked={oneWeek}
            onChange={e => setOneWeek(e.target.checked)}
            className="w-4 h-4 accent-[#E05B1F]" />
          <span className="text-[13px] text-silver font-semibold">Μία αγωνιστική ανά ΠΣΚ (σαββατοκύριακο)</span>
        </label>
        <label className="flex items-center gap-2.5">
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
            <Link href="/"
              className="px-4 py-2 rounded-lg bg-turf border border-lit/25 text-lit text-[12px] font-bold">
              Στους αγώνες
            </Link>
            <Link href="/standings"
              className="px-4 py-2 rounded-lg bg-turf border border-chalk/[0.08] text-silver text-[12px] font-bold">
              Βαθμολογία
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

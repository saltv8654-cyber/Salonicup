'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Crest, Loading, Empty } from '@/app/ui'
import { Modal, Field, SaveBtn, LogoUpload } from '../ui'
import toast from 'react-hot-toast'

const GROUPS = 'ABCDEFGHIJKL'.split('')  // 12 όμιλοι

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Round-robin 4 ομάδων → 3 αγωνιστικές (κάθε ομάδα 3 αγώνες)
function roundRobin4(ids: string[]): { round: number; a: string; b: string }[] {
  const [t0, t1, t2, t3] = ids
  const out: { round: number; a: string; b: string }[] = []
  if (t0 && t1) out.push({ round: 1, a: t0, b: t1 })
  if (t2 && t3) out.push({ round: 1, a: t2, b: t3 })
  if (t0 && t2) out.push({ round: 2, a: t0, b: t2 })
  if (t3 && t1) out.push({ round: 2, a: t3, b: t1 })
  if (t0 && t3) out.push({ round: 3, a: t0, b: t3 })
  if (t1 && t2) out.push({ round: 3, a: t1, b: t2 })
  return out
}

export default function AdminCup() {
  const supabase = createClient()
  const [load, setLoad]       = useState(true)
  const [leagues, setLeagues] = useState<any[]>([])
  const [teams, setTeams]     = useState<any[]>([])
  const [cupTeams, setCupTeams] = useState<any[]>([])
  const [cupMatches, setCupMatches] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newOpen, setNewOpen] = useState(false)
  const [busy, setBusy]       = useState(false)

  const cup = leagues.find(l => l.is_cup)
  const sourceLeagues = leagues.filter(l => !l.is_cup)

  async function fetchAll() {
    const [l, t] = await Promise.all([
      supabase.from('leagues').select('*').order('sort_order'),
      supabase.from('teams').select('team_id, name, logo_url, league_id').order('name'),
    ])
    setLeagues(l.data ?? [])
    setTeams(t.data ?? [])
    const c = (l.data ?? []).find((x: any) => x.is_cup)
    if (c) {
      const [ct, cm] = await Promise.all([
        supabase.from('cup_teams').select('*').eq('cup_id', c.league_id),
        supabase.from('matches').select('match_id, team_a, team_b, round, cup_group, stage, match_status, goals_team_a, goals_team_b, match_date')
          .eq('league_id', c.league_id),
      ])
      setCupTeams(ct.data ?? [])
      setCupMatches(cm.data ?? [])
      setSelected(new Set((ct.data ?? []).map((r: any) => r.team_id)))
    } else {
      setCupTeams([]); setCupMatches([]); setSelected(new Set())
    }
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [])

  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.team_id, t])), [teams])
  const leagueName = (id: string) => leagues.find(l => l.league_id === id)?.name ?? '—'

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // Αποθήκευση επιλογής ομάδων (sync cup_teams)
  async function saveSelection() {
    if (!cup) return
    setBusy(true)
    const cur = new Set(cupTeams.map(c => c.team_id))
    const toAdd = [...selected].filter(id => !cur.has(id))
    const toDel = [...cur].filter(id => !selected.has(id))
    if (toAdd.length) {
      const { error } = await supabase.from('cup_teams')
        .insert(toAdd.map(id => ({ cup_id: cup.league_id, team_id: id })))
      if (error) { setBusy(false); return toast.error('Δεν αποθηκεύτηκε: ' + error.message) }
    }
    if (toDel.length) {
      await supabase.from('cup_teams').delete().eq('cup_id', cup.league_id).in('team_id', toDel)
    }
    setBusy(false)
    toast.success('Αποθηκεύτηκε η επιλογή')
    fetchAll()
  }

  // Κλήρωση: τυχαία 12 όμιλοι × 4 + δημιουργία αγώνων ομίλων
  async function runDraw() {
    if (!cup) return
    const ids = [...selected]
    if (ids.length < 4) return toast.error('Διάλεξε ομάδες πρώτα')
    if (ids.length % 4 !== 0) return toast.error('Ο αριθμός ομάδων πρέπει να είναι πολλαπλάσιο του 4')
    if (ids.length !== 48 && !confirm(`Έχεις ${ids.length} ομάδες (όχι 48). Να γίνει κλήρωση σε ${ids.length / 4} ομίλους;`)) return
    if (cupMatches.length && !confirm('Υπάρχουν ήδη αγώνες κυπέλλου. Η νέα κλήρωση θα τους ΣΒΗΣΕΙ και θα ξαναφτιάξει ομίλους. Συνέχεια;')) return
    setBusy(true)
    try {
      // 1) Σβήσε παλιούς αγώνες κυπέλλου
      await supabase.from('matches').delete().eq('league_id', cup.league_id)
      // 2) Τυχαία σειρά + ανάθεση ομίλων
      const order = shuffle(ids)
      const nGroups = Math.ceil(order.length / 4)
      const rows = order.map((id, i) => ({
        cup_id: cup.league_id, team_id: id, grp: GROUPS[Math.floor(i / 4)] ?? null, seed: i + 1,
      }))
      // upsert grp/seed
      const { error: upErr } = await supabase.from('cup_teams')
        .upsert(rows, { onConflict: 'cup_id,team_id' })
      if (upErr) throw upErr
      // 3) Αγώνες ομίλων
      const fixtures: any[] = []
      for (let g = 0; g < nGroups; g++) {
        const grp = GROUPS[g]
        const gIds = order.slice(g * 4, g * 4 + 4)
        for (const m of roundRobin4(gIds)) {
          fixtures.push({
            league_id: cup.league_id, cup_group: grp, round: m.round,
            team_a: m.a, team_b: m.b, match_status: 'Scheduled', stage: null,
          })
        }
      }
      if (fixtures.length) {
        const { error: mErr } = await supabase.from('matches').insert(fixtures)
        if (mErr) throw mErr
      }
      toast.success(`Κλήρωση: ${nGroups} όμιλοι, ${fixtures.length} αγώνες`)
      fetchAll()
    } catch (e: any) {
      toast.error('Σφάλμα κλήρωσης: ' + (e.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  if (load) return <Loading />

  // Όμιλοι μετά την κλήρωση
  const drawn = cupTeams.some(c => c.grp)
  const groupsMap = new Map<string, any[]>()
  for (const c of cupTeams) {
    if (!c.grp) continue
    if (!groupsMap.has(c.grp)) groupsMap.set(c.grp, [])
    groupsMap.get(c.grp)!.push(c)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-extrabold text-chalk">Κύπελλο</h1>
        {cup && <Link href="/cup" className="text-[11px] font-bold text-lit">Δημόσια σελίδα ›</Link>}
      </div>

      {!cup ? (
        <div className="bg-turf rounded-xl border border-chalk/[0.05] p-4 text-center">
          <p className="text-[13px] text-silver mb-3">Δεν έχει δημιουργηθεί κύπελλο ακόμα.</p>
          <button onClick={() => setNewOpen(true)}
            className="px-4 py-2.5 rounded-lg bg-gradient-to-b from-lit to-brand text-white text-[13px] font-extrabold">
            + Δημιουργία Κυπέλλου
          </button>
        </div>
      ) : (
        <>
          {/* Κεφαλίδα κυπέλλου */}
          <div className="flex items-center gap-3 bg-turf rounded-xl border border-chalk/[0.05] px-3.5 py-3 mb-3">
            {cup.logo_url ? <img src={cup.logo_url} alt="" className="w-9 h-9 object-contain" /> : <span className="text-2xl">🏆</span>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-chalk truncate">{cup.name}</p>
              <p className="text-[10.5px] text-dim">{selected.size} ομάδες επιλεγμένες{drawn ? ` · ${groupsMap.size} όμιλοι` : ''}</p>
            </div>
          </div>

          {/* Επιλογή ομάδων ανά πρωτάθλημα (δυναμικότητα) */}
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-[12px] font-extrabold text-lit">Επιλογή ομάδων ({selected.size})</span>
            <button onClick={saveSelection} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-chalk/[0.06] text-silver text-[11px] font-bold disabled:opacity-50">
              Αποθήκευση επιλογής
            </button>
          </div>
          <div className="flex flex-col gap-3 mb-4">
            {sourceLeagues.map(l => {
              const lt = teams.filter(t => t.league_id === l.league_id)
              if (!lt.length) return null
              const selN = lt.filter(t => selected.has(t.team_id)).length
              return (
                <div key={l.league_id} className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-chalk/[0.05]">
                    <span className="text-[11.5px] font-extrabold text-chalk flex-1">{l.name}</span>
                    <span className="text-[10px] text-dim font-bold">{selN}/{lt.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-chalk/[0.04]">
                    {lt.map(t => {
                      const on = selected.has(t.team_id)
                      return (
                        <button key={t.team_id} onClick={() => toggle(t.team_id)}
                          className={`flex items-center gap-2 px-2.5 py-2 text-left bg-turf active:bg-[#1C1C22]
                            ${on ? 'bg-lit/[0.08]' : ''}`}>
                          <span className={`w-4 h-4 rounded grid place-items-center text-[10px] shrink-0 border
                            ${on ? 'bg-lit border-lit text-[#1a1508]' : 'border-chalk/20 text-transparent'}`}>✓</span>
                          <Crest url={t.logo_url} name={t.name} size={18} />
                          <span className="flex-1 text-[11.5px] text-chalk truncate">{t.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Κλήρωση */}
          <button onClick={runDraw} disabled={busy || selected.size < 4}
            className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand text-white
              font-extrabold text-[14px] disabled:opacity-50 mb-4">
            🎲 {drawn ? 'Νέα κλήρωση' : 'Κλήρωση'} ({selected.size} ομάδες → {Math.floor(selected.size / 4)} όμιλοι)
          </button>

          {/* Όμιλοι */}
          {drawn && (
            <div className="grid grid-cols-2 gap-2">
              {GROUPS.filter(g => groupsMap.has(g)).map(g => (
                <div key={g} className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                  <div className="px-3 py-1.5 bg-lit/[0.10] text-[11px] font-extrabold text-lit">Όμιλος {g}</div>
                  <div className="flex flex-col">
                    {groupsMap.get(g)!.sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0)).map(c => {
                      const t = teamById[c.team_id]
                      return (
                        <div key={c.team_id} className="flex items-center gap-2 px-2.5 py-1.5 border-t border-chalk/[0.04]">
                          <Crest url={t?.logo_url} name={t?.name} size={18} />
                          <span className="flex-1 text-[11px] text-chalk truncate">{t?.name ?? '—'}</span>
                          <span className="text-[8px] text-off">{leagueName(t?.league_id).slice(0, 4)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {newOpen && (
        <CupForm onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); fetchAll() }} />
      )}
    </div>
  )
}

function CupForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [name, setName]   = useState('Salonicup World Cup')
  const [season, setSeason] = useState('2026')
  const [logo, setLogo]   = useState('')
  const [busy, setBusy]   = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Χρειάζεται όνομα')
    setBusy(true)
    const { error } = await supabase.from('leagues').insert({
      name: name.trim(), season: season.trim() || null, logo_url: logo.trim() || null,
      is_cup: true, active: true, sort_order: 999,
    })
    setBusy(false)
    if (error) return toast.error('Δεν δημιουργήθηκε: ' + error.message)
    toast.success('Δημιουργήθηκε'); onSaved()
  }

  return (
    <Modal title="Νέο Κύπελλο" onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Salonicup World Cup" />
      <Field label="ΣΕΖΟΝ" value={season} onChange={setSeason} placeholder="2026" />
      <LogoUpload bucket="logos" url={logo} onChange={setLogo} fallback="🏆" label="ΣΗΜΑ ΚΥΠΕΛΛΟΥ" />
      <SaveBtn busy={busy} onClick={save} label="Δημιουργία" />
    </Modal>
  )
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import LineupPitch from '@/app/lineup-pitch'
import { FORMATIONS, slotCount } from '@/lib/formations'
import toast from 'react-hot-toast'

type Player = { player_id: string; full_name: string; number: number | null; photo_url: string | null; team_id: string }
type Lg = { league_id: string; name: string }

// Χρώμα ανά πρωτάθλημα (ίδιο με το overlay)
function leagueAccent(name?: string): string {
  const n = (name || '').toLowerCase()
  if (n.includes('elite')) return '#F7B01B'
  if (n.includes('liga')) return '#FFE000'
  if (n.includes('master')) return '#2BD46E'
  if (n.includes('trophy')) return '#F0463A'
  if (n.includes('east')) return '#3A78FF'
  if (n.includes('summer')) return '#B14BFF'
  return '#E05B1F'
}

export default function AdminToteam() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Record<string, string>>({})
  const [leagues, setLeagues] = useState<Lg[]>([])
  const [leagueId, setLeagueId] = useState<string>('')
  const [formation, setFormation] = useState('3-3-1')
  const [title, setTitle] = useState('Η ΟΜΑΔΑ ΤΗΣ ΑΓΩΝΙΣΤΙΚΗΣ')
  const [round, setRound] = useState('')
  const [picks, setPicks] = useState<(string | null)[]>(Array(8).fill(null))
  const [active, setActive] = useState<number | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      const [p, t, l] = await Promise.all([
        supabase.from('players').select('player_id, full_name, number, photo_url, team_id').order('full_name'),
        supabase.from('teams').select('team_id, name'),
        supabase.from('leagues').select('league_id, name').eq('active', true).order('sort_order'),
      ])
      setPlayers((p.data ?? []) as any)
      const tm: Record<string, string> = {}
      ;(t.data ?? []).forEach((x: any) => { tm[x.team_id] = x.name })
      setTeams(tm)
      setLeagues((l.data ?? []) as any)
      setLoad(false)
    })()
  }, [])

  // Κράτα το μήκος του picks ίσο με τις θέσεις της διάταξης
  useEffect(() => {
    const n = slotCount(formation)
    setPicks(prev => {
      const arr = prev.slice(0, n)
      while (arr.length < n) arr.push(null)
      return arr
    })
  }, [formation])

  const pmap = useMemo(() => {
    const m: Record<string, Player> = {}
    players.forEach(p => { m[p.player_id] = p })
    return m
  }, [players])

  const league = leagues.find(l => l.league_id === leagueId)
  const accent = leagueAccent(league?.name)
  const sub = [league?.name, round && `${round}η αγωνιστική`].filter(Boolean).join(' · ')

  function placePlayer(id: string) {
    setPicks(prev => {
      if (prev.includes(id)) return prev.map(x => x === id ? null : x)  // toggle off
      const arr = [...prev]
      const slot = active != null ? active : arr.findIndex(x => x == null)
      if (slot < 0) { toast.error('Γέμισες τη διάταξη'); return prev }
      arr[slot] = id
      return arr
    })
    setActive(null)
  }
  function onSlot(i: number) {
    setPicks(prev => {
      if (prev[i]) { const arr = [...prev]; arr[i] = null; return arr }  // άδειασε
      return prev
    })
    setActive(a => (a === i ? null : i))
  }

  async function autoFill() {
    if (!leagueId) { toast.error('Διάλεξε πρωτάθλημα πρώτα'); return }
    const { data } = await supabase.from('player_stats').select('*').eq('league_id', leagueId)
    const ranked = (data ?? [])
      .map((s: any) => ({ id: s.player_id, score: s.goals * 3 + s.assists * 2 + (s.mvp_awards ?? 0) * 4 - s.red_cards }))
      .filter((x: any) => x.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, slotCount(formation))
      .map((x: any) => x.id)
    if (!ranked.length) { toast.error('Δεν βρέθηκαν στατιστικά'); return }
    const arr: (string | null)[] = Array(slotCount(formation)).fill(null)
    ranked.forEach((id: string, i: number) => { arr[i] = id })
    setPicks(arr)
    toast.success('Συμπληρώθηκε από στατιστικά — διόρθωσε ελεύθερα')
  }

  function openImage() {
    const ids = picks.map(x => x ?? '').join(',')
    const u = `/api/og/toteam?ids=${encodeURIComponent(ids)}&formation=${formation}` +
      `&title=${encodeURIComponent(title)}&sub=${encodeURIComponent(sub)}` +
      `&accent=${encodeURIComponent(accent)}&_=${Date.now()}`
    window.open(u, '_blank')
  }

  if (load) return <Loading />

  const filtered = q.trim()
    ? players.filter(p => p.full_name.toLowerCase().includes(q.trim().toLowerCase()))
    : players
  const count = picks.filter(Boolean).length

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <h1 className="text-xl font-black text-chalk">🏅 Ομάδα της αγωνιστικής</h1>
      <p className="text-[12px] text-silver mt-0.5 mb-4">
        Διάλεξε τους {slotCount(formation)} παίκτες, φτιάξε την εικόνα και ανέβασέ την στο Instagram.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <select value={leagueId} onChange={e => setLeagueId(e.target.value)}
          className="bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px]">
          <option value="">Πρωτάθλημα (χρώμα)…</option>
          {leagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name}</option>)}
        </select>
        <select value={formation} onChange={e => setFormation(e.target.value)}
          className="bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px]">
          {FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input value={round} onChange={e => setRound(e.target.value)} placeholder="Αγων." inputMode="numeric"
          className="w-20 bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[13px]" />
        <button onClick={autoFill}
          className="px-3 py-2 rounded-lg bg-chalk/[0.06] text-silver text-[12.5px] font-bold border border-chalk/10">
          ⚡ Αυto από σκόρερς
        </button>
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)}
        className="w-full bg-turf border border-chalk/10 rounded-lg px-3 py-2 text-chalk text-[14px] font-bold mb-4" />

      {/* Γήπεδο */}
      <div className="max-w-sm mx-auto mb-3">
        <LineupPitch formation={formation} line={picks} players={pmap} accent={accent}
          onSlot={onSlot} />
      </div>
      <div className="text-center text-[12px] text-silver mb-3">
        {active != null ? <span className="text-lit font-bold">Διάλεξε παίκτη για τη θέση {active + 1}</span>
          : <>Επιλεγμένοι <b className="text-chalk">{count}/{picks.length}</b> · πάτα θέση για άδειασμα</>}
      </div>

      <button onClick={openImage} disabled={count === 0}
        className="w-full mb-4 py-3 rounded-xl font-black text-[14px] text-white
          bg-gradient-to-b from-lit to-brand disabled:opacity-50">
        📸 Άνοιγμα εικόνας για Instagram
      </button>

      {/* Λίστα παικτών */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Αναζήτηση παίκτη…"
        className="w-full bg-turf border border-chalk/10 rounded-lg px-3 py-2.5 text-chalk text-[14px] mb-2" />
      <div className="grid grid-cols-2 gap-1.5">
        {filtered.slice(0, 60).map(p => {
          const on = picks.includes(p.player_id)
          return (
            <button key={p.player_id} onClick={() => placePlayer(p.player_id)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border text-left
                ${on ? 'bg-brand/20 border-brand/50' : 'bg-turf border-chalk/[0.07]'}`}>
              <span className="w-7 h-7 rounded-full bg-chalk/[0.08] grid place-items-center text-[11px] font-black text-silver overflow-hidden shrink-0">
                {p.photo_url ? <img src={p.photo_url} alt="" className="w-full h-full object-cover" /> : (p.number ?? p.full_name[0])}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-chalk truncate">{p.full_name}</span>
                <span className="block text-[10px] text-dim truncate">{teams[p.team_id] ?? ''}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

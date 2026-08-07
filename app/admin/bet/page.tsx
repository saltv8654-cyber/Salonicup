'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading, Crest } from '@/app/ui'
import { fmtDay, fmtTime } from '@/lib/time'
import { computeOdds, type TeamStat } from '@/lib/bet/odds'
import toast from 'react-hot-toast'

type Standing = {
  team_id: string; league_id: string; team_name: string; logo_url: string | null
  played: number; wins: number; draws: number; losses: number
  goals_for: number; goals_against: number; points: number; position: number
}
type UpMatch = {
  match_id: string; league_id: string; match_date: string | null
  team_a: string; team_b: string
  team_a_data: { name: string; logo_url: string | null } | null
  team_b_data: { name: string; logo_url: string | null } | null
  league: { name: string } | null
}
type OddsRow = {
  match_id: string; home: number; draw: number; away: number
  over25: number; under25: number; btts_yes: number; btts_no: number
  p_home: number; p_draw: number; p_away: number
}
// Πρόχειρες (επεξεργάσιμες) αποδόσεις ανά αγώνα, πριν τη δημοσίευση
type Draft = {
  home: string; draw: string; away: string
  over25: string; under25: string; btts_yes: string; btts_no: string
  p_home: number; p_draw: number; p_away: number
}

export default function AdminBet() {
  const supabase = createClient()
  const [load, setLoad] = useState(true)
  const [standings, setStandings] = useState<Standing[]>([])
  const [matches, setMatches] = useState<UpMatch[]>([])
  const [played, setPlayed] = useState<any[]>([])
  const [published, setPublished] = useState<Record<string, OddsRow>>({})
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  async function fetchAll() {
    setLoad(true)
    const [s, m, p, o] = await Promise.all([
      supabase.from('standings').select('*'),
      supabase.from('matches')
        .select(`match_id, league_id, match_date, team_a, team_b,
          team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url), league:league_id(name)`)
        .eq('match_status', 'Scheduled')
        .order('match_date', { ascending: true, nullsFirst: false }),
      supabase.from('matches')
        .select('league_id, team_a, team_b, goals_team_a, goals_team_b, match_date')
        .in('match_status', ['Played', 'Forfeit']).order('match_date', { ascending: false }),
      supabase.from('bet_odds').select('*'),
    ])
    setStandings((s.data ?? []) as Standing[])
    setMatches((m.data ?? []) as any)
    setPlayed(p.data ?? [])
    const pub: Record<string, OddsRow> = {}
    ;(o.data ?? []).forEach((r: any) => { pub[r.match_id] = r })
    setPublished(pub)
    setLoad(false)
  }
  useEffect(() => { fetchAll() }, [])

  // Στατιστικά ανά ομάδα + μέσος όρος γκολ ανά πρωτάθλημα
  const statOf = useMemo(() => {
    const byTeam = new Map<string, Standing>()
    standings.forEach(r => byTeam.set(r.team_id, r))
    // Φόρμα: πόντοι τελευταίων 5 αγώνων / 15
    const form = new Map<string, number>()
    const seen = new Map<string, number>()
    for (const g of played) {
      for (const side of ['a', 'b'] as const) {
        const tid = side === 'a' ? g.team_a : g.team_b
        const gf = side === 'a' ? g.goals_team_a : g.goals_team_b
        const ga = side === 'a' ? g.goals_team_b : g.goals_team_a
        const c = seen.get(tid) ?? 0
        if (c >= 5) continue
        seen.set(tid, c + 1)
        const pts = gf > ga ? 3 : gf === ga ? 1 : 0
        form.set(tid, (form.get(tid) ?? 0) + pts)
      }
    }
    const baseByLeague = new Map<string, number>()
    const agg = new Map<string, { gf: number; pl: number }>()
    standings.forEach(r => {
      const a = agg.get(r.league_id) ?? { gf: 0, pl: 0 }
      a.gf += r.goals_for; a.pl += r.played; agg.set(r.league_id, a)
    })
    agg.forEach((v, k) => baseByLeague.set(k, v.pl > 0 ? v.gf / v.pl : 1.3))
    return { byTeam, form, seen, baseByLeague }
  }, [standings, played])

  function computeFor(m: UpMatch): Draft | null {
    const h = statOf.byTeam.get(m.team_a)
    const a = statOf.byTeam.get(m.team_b)
    const base = statOf.baseByLeague.get(m.league_id) ?? 1.3
    const mk = (s: Standing | undefined, tid: string): TeamStat => ({
      played: s?.played ?? 0, gf: s?.goals_for ?? 0, ga: s?.goals_against ?? 0,
      points: s?.points ?? 0, position: s?.position ?? 0,
      form: (statOf.form.get(tid) ?? 0) / (3 * Math.max(1, statOf.seen.get(tid) ?? 0)),
    })
    const o = computeOdds(mk(h, m.team_a), mk(a, m.team_b), base)
    return {
      home: o.home.toFixed(2), draw: o.draw.toFixed(2), away: o.away.toFixed(2),
      over25: o.over25.toFixed(2), under25: o.under25.toFixed(2),
      btts_yes: o.bttsYes.toFixed(2), btts_no: o.bttsNo.toFixed(2),
      p_home: o.pHome, p_draw: o.pDraw, p_away: o.pAway,
    }
  }

  // Πρόχειρες τιμές: υπολογισμένες ή ήδη δημοσιευμένες
  const draftFor = (m: UpMatch): Draft => {
    if (draft[m.match_id]) return draft[m.match_id]
    const pub = published[m.match_id]
    if (pub) return {
      home: String(pub.home), draw: String(pub.draw), away: String(pub.away),
      over25: String(pub.over25), under25: String(pub.under25),
      btts_yes: String(pub.btts_yes), btts_no: String(pub.btts_no),
      p_home: pub.p_home, p_draw: pub.p_draw, p_away: pub.p_away,
    }
    return computeFor(m) ?? {
      home: '', draw: '', away: '', over25: '', under25: '', btts_yes: '', btts_no: '',
      p_home: 0, p_draw: 0, p_away: 0,
    }
  }

  function setField(id: string, m: UpMatch, k: keyof Draft, v: string) {
    setDraft(d => ({ ...d, [id]: { ...draftFor(m), [k]: v } }))
  }
  function recompute(m: UpMatch) {
    const c = computeFor(m)
    if (c) setDraft(d => ({ ...d, [m.match_id]: c }))
  }

  async function publishOne(m: UpMatch) {
    const d = draftFor(m)
    const num = (x: string) => { const n = parseFloat(x); return Number.isFinite(n) && n >= 1.01 ? n : null }
    const row = {
      match_id: m.match_id,
      home: num(d.home), draw: num(d.draw), away: num(d.away),
      over25: num(d.over25), under25: num(d.under25),
      btts_yes: num(d.btts_yes), btts_no: num(d.btts_no),
      p_home: d.p_home, p_draw: d.p_draw, p_away: d.p_away,
      updated_at: new Date().toISOString(),
    }
    if ([row.home, row.draw, row.away].some(v => v == null)) {
      toast.error('Συμπλήρωσε 1 / Χ / 2'); return
    }
    setSaving(m.match_id)
    const { error } = await supabase.from('bet_odds').upsert(row, { onConflict: 'match_id' })
    setSaving(null)
    if (error) { toast.error('Δεν αποθηκεύτηκε: ' + error.message); return }
    toast.success('Δημοσιεύτηκε')
    setPublished(p => ({ ...p, [m.match_id]: row as any }))
    setDraft(d => { const n = { ...d }; delete n[m.match_id]; return n })
  }

  async function publishAll() {
    const toPublish = matches.filter(m => statOf.byTeam.has(m.team_a) || statOf.byTeam.has(m.team_b))
    if (!toPublish.length) { toast.error('Δεν υπάρχουν αγώνες'); return }
    setSaving('all')
    const rows = toPublish.map(m => {
      const d = draftFor(m)
      const num = (x: string) => { const n = parseFloat(x); return Number.isFinite(n) ? n : null }
      return {
        match_id: m.match_id,
        home: num(d.home), draw: num(d.draw), away: num(d.away),
        over25: num(d.over25), under25: num(d.under25),
        btts_yes: num(d.btts_yes), btts_no: num(d.btts_no),
        p_home: d.p_home, p_draw: d.p_draw, p_away: d.p_away,
        updated_at: new Date().toISOString(),
      }
    }).filter(r => r.home != null && r.draw != null && r.away != null)
    const { error } = await supabase.from('bet_odds').upsert(rows, { onConflict: 'match_id' })
    setSaving(null)
    if (error) { toast.error('Σφάλμα: ' + error.message); return }
    toast.success(`Δημοσιεύτηκαν ${rows.length} αγώνες`)
    fetchAll()
    setDraft({})
  }

  if (load) return <Loading />

  const grouped = new Map<string, UpMatch[]>()
  for (const m of matches) {
    const key = m.league?.name ?? '—'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(m)
  }

  const oddsChip = (label: string, val: string, prob?: number, strong?: boolean) => (
    <div className={`flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[52px]
      ${strong ? 'bg-brand/20 border border-brand/40' : 'bg-chalk/[0.05] border border-chalk/[0.08]'}`}>
      <span className="text-[9px] font-black text-dim tracking-wider">{label}</span>
      <span className="text-[15px] font-black text-chalk tabular-nums leading-tight">{val || '—'}</span>
      {prob != null && <span className="text-[8.5px] text-silver">{Math.round(prob * 100)}%</span>}
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-black text-chalk">🎲 Salonicup Bet</h1>
          <p className="text-[12px] text-silver mt-0.5">
            Αυτόματες αποδόσεις από στατιστική ανάλυση (Poisson: γκολ, φόρμα, βαθμολογία).
            Διόρθωσε αν θες και δημοσίευσε — ο κόσμος τις βλέπει στο <b>/bet</b>.
          </p>
        </div>
      </div>

      <button onClick={publishAll} disabled={saving === 'all'}
        className="w-full mb-4 py-3 rounded-xl font-black text-[14px] text-white
          bg-gradient-to-b from-lit to-brand disabled:opacity-60">
        {saving === 'all' ? 'Δημοσίευση…' : '⚡ Υπολόγισε & δημοσίευσε αποδόσεις για όλους'}
      </button>

      {matches.length === 0 && (
        <div className="text-center text-silver text-sm py-12">
          Δεν υπάρχουν προγραμματισμένοι αγώνες για στοίχημα.
        </div>
      )}

      {[...grouped.entries()].map(([lg, ms]) => (
        <div key={lg} className="mb-5">
          <div className="text-[11px] font-black text-lit tracking-[0.12em] uppercase mb-2">{lg}</div>
          <div className="flex flex-col gap-2">
            {ms.map(m => {
              const d = draftFor(m)
              const pub = published[m.match_id]
              const open = openId === m.match_id
              return (
                <div key={m.match_id} className="rounded-xl bg-turf border border-chalk/[0.07] overflow-hidden">
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={22} />
                        <span className="text-[13px] font-bold text-chalk truncate">{m.team_a_data?.name}</span>
                        <span className="text-dim text-[12px]">–</span>
                        <span className="text-[13px] font-bold text-chalk truncate">{m.team_b_data?.name}</span>
                        <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={22} />
                      </div>
                      <span className="text-[10px] text-dim shrink-0">
                        {m.match_date ? `${fmtDay(m.match_date)} ${fmtTime(m.match_date)}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {oddsChip('1', d.home, d.p_home)}
                      {oddsChip('Χ', d.draw, d.p_draw)}
                      {oddsChip('2', d.away, d.p_away)}
                      <div className="w-px self-stretch bg-chalk/10 mx-0.5" />
                      {oddsChip('O7.5', d.over25)}
                      {oddsChip('U7.5', d.under25)}
                      {oddsChip('GG', d.btts_yes)}
                      <div className="ml-auto flex items-center gap-1.5">
                        {pub && <span className="text-[10px] font-bold text-[#35c66b]">● live</span>}
                        <button onClick={() => setOpenId(open ? null : m.match_id)}
                          className="text-[11px] font-bold text-silver px-2 py-1 rounded-lg bg-chalk/[0.05]">
                          {open ? 'Κλείσιμο' : '✎'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {open && (
                    <div className="px-3 pb-3 pt-1 border-t border-chalk/[0.06] bg-pitch/40">
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {([
                          ['1', 'home'], ['Χ', 'draw'], ['2', 'away'],
                          ['O7.5', 'over25'], ['U7.5', 'under25'], ['GG', 'btts_yes'], ['NG', 'btts_no'],
                        ] as [string, keyof Draft][]).map(([lbl, key]) => (
                          <label key={key} className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-black text-dim">{lbl}</span>
                            <input value={String(d[key] ?? '')} inputMode="decimal"
                              onChange={e => setField(m.match_id, m, key, e.target.value)}
                              className="w-full bg-turf border border-chalk/10 rounded-lg px-2 py-1.5
                                text-chalk text-[13px] tabular-nums" />
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => recompute(m)}
                          className="flex-1 py-2 rounded-lg text-[12px] font-bold text-silver bg-chalk/[0.05]">
                          ↻ Επαναϋπολογισμός
                        </button>
                        <button onClick={() => publishOne(m)} disabled={saving === m.match_id}
                          className="flex-1 py-2 rounded-lg text-[12px] font-black text-white
                            bg-gradient-to-b from-lit to-brand disabled:opacity-60">
                          {saving === m.match_id ? '…' : 'Δημοσίευση'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

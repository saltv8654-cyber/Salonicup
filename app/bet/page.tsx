'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { BottomNav, Crest, Loading, Watermark } from '@/app/ui'
import { fmtDay, fmtTime } from '@/lib/time'
import toast from 'react-hot-toast'

type Team = { name: string; logo_url: string | null }
type Match = {
  match_id: string; league_id: string; match_date: string | null
  match_status: string; goals_team_a: number; goals_team_b: number
  team_a: string; team_b: string
  team_a_data: Team | null; team_b_data: Team | null; league: { name: string } | null
}
type OddsRow = {
  match_id: string; home: number; draw: number; away: number
  over25: number; under25: number; btts_yes: number; btts_no: number
}
type Bet = {
  bet_id: string; match_id: string; market: string; selection: string
  odds: number; stake: number; status: string; payout: number; created_at: string
  match: (Match & { league: { name: string } | null }) | null
}
type Leader = { user_id: string; name: string; points: number }

type Tab = 'upcoming' | 'results' | 'mine' | 'board'
type Slip = { match: Match; market: string; selection: string; label: string; odds: number } | null

const pts = (n: number) => `${Math.round(n * 100) / 100}`.replace(/\.00$/, '')

// Ποια επιλογή κέρδισε σε τελειωμένο αγώνα
function outcomes(m: Match) {
  const a = m.goals_team_a ?? 0, b = m.goals_team_b ?? 0, tot = a + b
  return {
    '1X2': a > b ? '1' : a < b ? '2' : 'X',
    OU25: tot >= 8 ? 'O' : 'U',
    BTTS: a > 0 && b > 0 ? 'Y' : 'N',
  } as Record<string, string>
}
const SEL_LABEL: Record<string, string> = {
  '1': '1', X: 'Χ', '2': '2', O: 'Over 7.5', U: 'Under 7.5', Y: 'Goal/Goal', N: 'No Goal',
}

export default function BetPage() {
  const supabase = createClient()
  const { profile, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [load, setLoad] = useState(true)
  const [matches, setMatches] = useState<Match[]>([])
  const [results, setResults] = useState<Match[]>([])
  const [odds, setOdds] = useState<Record<string, OddsRow>>({})
  const [wallet, setWallet] = useState<number | null>(null)
  const [myBets, setMyBets] = useState<Bet[]>([])
  const [board, setBoard] = useState<Leader[]>([])
  const [slip, setSlip] = useState<Slip>(null)
  const [stake, setStake] = useState('50')
  const [placing, setPlacing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const sel = `match_id, league_id, match_date, match_status, goals_team_a, goals_team_b,
    team_a, team_b, team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url),
    league:league_id(name)`

  async function fetchCore() {
    const [up, rz, od] = await Promise.all([
      supabase.from('matches').select(sel).eq('match_status', 'Scheduled')
        .order('match_date', { ascending: true, nullsFirst: false }).limit(60),
      supabase.from('matches').select(sel).in('match_status', ['Played', 'Forfeit'])
        .order('match_date', { ascending: false }).limit(30),
      supabase.from('bet_odds').select('*'),
    ])
    setMatches((up.data ?? []) as any)
    setResults((rz.data ?? []) as any)
    const om: Record<string, OddsRow> = {}
    ;(od.data ?? []).forEach((r: any) => { om[r.match_id] = r })
    setOdds(om)
    setLoad(false)
  }

  async function fetchMine() {
    if (!profile?.id) { setWallet(null); setMyBets([]); return }
    const [w, b] = await Promise.all([
      supabase.from('bet_wallets').select('points').eq('user_id', profile.id).maybeSingle(),
      supabase.from('bets').select(`*, match:match_id(${sel})`)
        .order('created_at', { ascending: false }).limit(50),
    ])
    setWallet(w.data?.points ?? 1000)
    setMyBets((b.data ?? []) as any)
  }

  async function fetchBoard() {
    const { data } = await supabase.from('bet_leaderboard').select('*')
      .order('points', { ascending: false }).limit(50)
    setBoard((data ?? []) as any)
  }

  useEffect(() => { fetchCore(); fetchBoard() }, [])
  useEffect(() => { if (!authLoading) fetchMine() }, [profile?.id, authLoading])

  function openSlip(match: Match, market: string, selection: string, odds: number) {
    if (!profile?.id) { toast.error('Συνδέσου για να στοιχηματίσεις'); return }
    setSlip({ match, market, selection, odds, label: SEL_LABEL[selection] })
    setStake('50')
  }

  async function place() {
    if (!slip) return
    const amount = parseFloat(stake)
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Βάλε ποσό'); return }
    if (wallet != null && amount > wallet) { toast.error('Δεν έχεις αρκετούς πόντους'); return }
    setPlacing(true)
    const { error } = await supabase.rpc('place_bet', {
      p_match: slip.match.match_id, p_market: slip.market,
      p_selection: slip.selection, p_stake: amount,
    })
    setPlacing(false)
    if (error) { toast.error(error.message.replace(/^.*?:\s*/, '')); return }
    toast.success('Το κουπόνι μπήκε!')
    setSlip(null)
    fetchMine(); fetchBoard()
  }

  const OddBtn = ({ m, market, selection, val }:
    { m: Match; market: string; selection: string; val?: number }) => (
    <button disabled={val == null} onClick={() => openSlip(m, market, selection, val!)}
      className={`flex-1 flex flex-col items-center py-2 rounded-lg border transition-colors
        ${val == null ? 'bg-chalk/[0.03] border-chalk/[0.05] text-dim'
          : 'bg-chalk/[0.05] border-chalk/[0.09] text-chalk active:bg-brand/25 active:border-brand/50'}`}>
      <span className="text-[9.5px] font-black text-dim">{SEL_LABEL[selection]}</span>
      <span className="text-[15px] font-black tabular-nums leading-tight">{val != null ? val.toFixed(2) : '—'}</span>
    </button>
  )

  if (load || authLoading) return (
    <div className="min-h-screen bg-pitch"><Loading /></div>
  )

  const TABS: [Tab, string][] = [
    ['upcoming', '🎯 Αγώνες'], ['results', '✅ Αποτελέσματα'],
    ['mine', '🎟 Κουπόνια'], ['board', '🏆 Κατάταξη'],
  ]

  return (
    <div className="min-h-screen bg-pitch pb-24">
      <header className="relative px-4 pt-6 pb-4 overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-36"><Watermark opacity={0.05} /></div>
        <div className="relative flex items-end justify-between gap-3">
          <div>
            <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
            <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">🎲 Bet</h1>
          </div>
          {profile?.id ? (
            <div className="text-right">
              <div className="text-[9px] font-bold text-dim tracking-wider uppercase">Πόντοι</div>
              <div className="text-xl font-black text-lit tabular-nums">{wallet != null ? pts(wallet) : '—'}</div>
            </div>
          ) : (
            <Link href="/auth/login"
              className="text-[12px] font-bold text-chalk bg-brand/20 border border-brand/40
                rounded-full px-3.5 py-2">Σύνδεση</Link>
          )}
        </div>
        <p className="relative text-[11px] text-silver mt-2 leading-snug">
          Αποδόσεις από στατιστική ανάλυση. Στοίχημα με πόντους — χωρίς λεφτά, μόνο για πλάκα & κατάταξη.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 px-3.5 pb-3 overflow-x-auto">
        {TABS.map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`shrink-0 px-3.5 py-2 rounded-full text-[11.5px] font-bold whitespace-nowrap border
              ${tab === t ? 'bg-brand text-chalk border-lit' : 'bg-turf text-dim border-chalk/[0.06]'}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div className="px-3.5">
        {/* ── ΑΓΩΝΕΣ ── */}
        {tab === 'upcoming' && (
          matches.length === 0
            ? <Msg>Δεν υπάρχουν διαθέσιμοι αγώνες για στοίχημα.</Msg>
            : <div className="flex flex-col gap-2.5">
              {matches.map(m => {
                const o = odds[m.match_id]
                const ex = expanded.has(m.match_id)
                return (
                  <div key={m.match_id} className="rounded-xl bg-turf border border-chalk/[0.07] p-3">
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="text-[10px] font-bold text-lit uppercase tracking-wider truncate">
                        {m.league?.name}</span>
                      <span className="text-[10px] text-dim shrink-0">
                        {m.match_date ? `${fmtDay(m.match_date)} ${fmtTime(m.match_date)}` : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={26} />
                        <span className="text-[13.5px] font-bold text-chalk truncate">{m.team_a_data?.name}</span>
                      </div>
                      <span className="text-dim text-[11px] shrink-0">vs</span>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="text-[13.5px] font-bold text-chalk truncate text-right">{m.team_b_data?.name}</span>
                        <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={26} />
                      </div>
                    </div>
                    {o ? (
                      <>
                        <div className="flex gap-1.5">
                          <OddBtn m={m} market="1X2" selection="1" val={o.home} />
                          <OddBtn m={m} market="1X2" selection="X" val={o.draw} />
                          <OddBtn m={m} market="1X2" selection="2" val={o.away} />
                        </div>
                        {ex && (
                          <div className="flex gap-1.5 mt-1.5">
                            <OddBtn m={m} market="OU25" selection="O" val={o.over25} />
                            <OddBtn m={m} market="OU25" selection="U" val={o.under25} />
                            <OddBtn m={m} market="BTTS" selection="Y" val={o.btts_yes} />
                            <OddBtn m={m} market="BTTS" selection="N" val={o.btts_no} />
                          </div>
                        )}
                        <button onClick={() => setExpanded(s => {
                          const n = new Set(s); n.has(m.match_id) ? n.delete(m.match_id) : n.add(m.match_id); return n
                        })} className="w-full mt-2 text-[10.5px] font-bold text-silver">
                          {ex ? 'Λιγότερα ▲' : 'Over/Under · Goal-Goal ▼'}
                        </button>
                      </>
                    ) : (
                      <div className="text-center text-[11px] text-dim py-1.5">Αποδόσεις σύντομα…</div>
                    )}
                  </div>
                )
              })}
            </div>
        )}

        {/* ── ΑΠΟΤΕΛΕΣΜΑΤΑ ── */}
        {tab === 'results' && (
          results.length === 0
            ? <Msg>Δεν υπάρχουν αποτελέσματα ακόμη.</Msg>
            : <div className="flex flex-col gap-2">
              {results.map(m => {
                const oc = outcomes(m)
                const o = odds[m.match_id]
                return (
                  <div key={m.match_id} className="rounded-xl bg-turf border border-chalk/[0.07] p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-lit uppercase tracking-wider truncate">
                        {m.league?.name}</span>
                      <span className="text-[10px] text-dim">{m.match_date ? fmtDay(m.match_date) : ''}</span>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-[13.5px] font-bold text-chalk truncate flex-1 text-right">{m.team_a_data?.name}</span>
                      <span className="text-[17px] font-black text-lit tabular-nums px-2 py-0.5 rounded-lg bg-pitch">
                        {m.goals_team_a}–{m.goals_team_b}</span>
                      <span className="text-[13.5px] font-bold text-chalk truncate flex-1">{m.team_b_data?.name}</span>
                    </div>
                    <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
                      <Pill on>{SEL_LABEL[oc['1X2']]} {o ? (oc['1X2'] === '1' ? o.home : oc['1X2'] === '2' ? o.away : o.draw).toFixed(2) : ''}</Pill>
                      <Pill on>{SEL_LABEL[oc.OU25]}</Pill>
                      <Pill on>{oc.BTTS === 'Y' ? 'Goal/Goal' : 'No Goal'}</Pill>
                    </div>
                  </div>
                )
              })}
            </div>
        )}

        {/* ── ΤΑ ΚΟΥΠΟΝΙΑ ΜΟΥ ── */}
        {tab === 'mine' && (
          !profile?.id ? <Msg>Συνδέσου για να δεις τα κουπόνια σου. <Link href="/auth/login" className="text-lit font-bold underline">Σύνδεση</Link></Msg>
            : myBets.length === 0 ? <Msg>Δεν έχεις κουπόνια ακόμη. Πήγαινε στους αγώνες!</Msg>
              : <div className="flex flex-col gap-2">
                {myBets.map(b => {
                  const st = b.status
                  const color = st === 'won' ? '#35c66b' : st === 'lost' ? '#e0563c' : st === 'void' ? '#8a8a95' : '#F5782E'
                  const stLbl = st === 'won' ? 'ΚΕΡΔΙΣΕ' : st === 'lost' ? 'ΕΧΑΣΕ' : st === 'void' ? 'ΑΚΥΡΟ' : 'ΕΚΚΡΕΜΕΙ'
                  return (
                    <div key={b.bet_id} className="rounded-xl bg-turf border p-3"
                      style={{ borderColor: color + '55' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-chalk truncate">
                          {b.match?.team_a_data?.name} – {b.match?.team_b_data?.name}</span>
                        <span className="text-[9.5px] font-black px-2 py-0.5 rounded-full"
                          style={{ color, background: color + '22' }}>{stLbl}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="text-silver">
                          <b className="text-chalk">{SEL_LABEL[b.selection] ?? b.selection}</b>
                          <span className="text-dim"> @ </span>
                          <b className="text-lit tabular-nums">{b.odds.toFixed(2)}</b>
                        </span>
                        <span className="text-silver">
                          Ποντάρισμα <b className="text-chalk tabular-nums">{pts(b.stake)}</b>
                          {st === 'won' && <span className="text-[#35c66b] font-bold"> → +{pts(b.payout)}</span>}
                          {st === 'pending' && <span className="text-dim"> → {pts(b.stake * b.odds)}</span>}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
        )}

        {/* ── ΚΑΤΑΤΑΞΗ ── */}
        {tab === 'board' && (
          board.length === 0 ? <Msg>Άδεια κατάταξη — γίνε ο πρώτος!</Msg>
            : <div className="flex flex-col gap-1.5">
              {board.map((r, i) => {
                const me = r.user_id === profile?.id
                return (
                  <div key={r.user_id}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border
                      ${me ? 'bg-brand/15 border-brand/40' : 'bg-turf border-chalk/[0.06]'}`}>
                    <span className={`w-6 text-center text-[14px] font-black tabular-nums
                      ${i === 0 ? 'text-[#F5C518]' : i === 1 ? 'text-[#C0C0C8]' : i === 2 ? 'text-[#CD7F32]' : 'text-dim'}`}>
                      {i + 1}</span>
                    <span className="flex-1 text-[13px] font-bold text-chalk truncate">
                      {r.name}{me && <span className="text-lit"> (εσύ)</span>}</span>
                    <span className="text-[14px] font-black text-lit tabular-nums">{pts(r.points)}</span>
                  </div>
                )
              })}
            </div>
        )}
      </div>

      {/* ── Δελτίο στοιχήματος (bet slip) ── */}
      {slip && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setSlip(null)}>
          <div className="w-full max-w-md bg-turf border-t border-lit/30 rounded-t-2xl p-4 pb-6"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-chalk/20 mx-auto mb-3" />
            <div className="text-[11px] text-lit font-bold uppercase tracking-wider">{slip.match.league?.name}</div>
            <div className="text-[15px] font-black text-chalk mb-3">
              {slip.match.team_a_data?.name} – {slip.match.team_b_data?.name}</div>
            <div className="flex items-center justify-between bg-pitch rounded-xl px-3.5 py-3 mb-3">
              <span className="text-[13px] font-bold text-chalk">{slip.label}</span>
              <span className="text-[16px] font-black text-lit tabular-nums">{slip.odds.toFixed(2)}</span>
            </div>
            <label className="block text-[10px] font-bold text-dim uppercase tracking-wider mb-1">Ποντάρισμα (πόντοι)</label>
            <div className="flex gap-2 mb-2">
              <input value={stake} inputMode="numeric" onChange={e => setStake(e.target.value)}
                className="flex-1 bg-pitch border border-chalk/10 rounded-xl px-3.5 py-3
                  text-chalk text-[17px] font-black tabular-nums" />
              {['25', '50', '100'].map(v => (
                <button key={v} onClick={() => setStake(v)}
                  className="px-3 rounded-xl bg-chalk/[0.06] text-silver text-[12px] font-bold">{v}</button>
              ))}
            </div>
            <div className="flex items-center justify-between text-[12px] mb-4">
              <span className="text-silver">Πιθανό κέρδος</span>
              <span className="text-[15px] font-black text-[#35c66b] tabular-nums">
                {pts((parseFloat(stake) || 0) * slip.odds)}</span>
            </div>
            {wallet != null && (
              <div className="text-[11px] text-dim mb-3 text-right">Διαθέσιμοι πόντοι: <b className="text-silver">{pts(wallet)}</b></div>
            )}
            <button onClick={place} disabled={placing}
              className="w-full py-3.5 rounded-xl font-black text-[15px] text-white
                bg-gradient-to-b from-lit to-brand disabled:opacity-60">
              {placing ? 'Καταχώρηση…' : '🎲 Στοίχημα'}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-silver text-[13px] py-12 px-6 leading-relaxed">{children}</div>
}
function Pill({ children, on }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full
      ${on ? 'bg-[#35c66b]/20 text-[#7fe0a5] border border-[#35c66b]/40'
           : 'bg-chalk/[0.05] text-silver border border-chalk/[0.08]'}`}>{children}</span>
  )
}

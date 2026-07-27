'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'
import { useNow } from '@/lib/hooks/useNow'
import { clockLabel, clockHalf } from '@/lib/clock'
import { fmtMinute } from '@/lib/match'
import LineupPitch from '@/app/lineup-pitch'
import type { Period } from '@/lib/types'

type Theme = { acc: string; acc2: string; bg0: string; bg1: string }
const THEMES: Record<string, Theme> = {
  orange: { acc: '#FF7A2F', acc2: '#E05B1F', bg0: '#0e1830', bg1: '#0a1020' },
  yellow: { acc: '#F2C230', acc2: '#D8A21F', bg0: '#1a1608', bg1: '#0e0c05' },
  miami:  { acc: '#ff2d95', acc2: '#d81f7a', bg0: '#1a0d3d', bg1: '#0a0618' },
}
const KEYS = ['orange', 'yellow', 'miami']
function themeFor(leagueId: string | undefined, override: string | null): Theme {
  if (override && THEMES[override]) return THEMES[override]
  let h = 0
  const s = leagueId ?? ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return THEMES[KEYS[h % 3]]
}

type Kind = 'GOAL' | 'YELLOW' | 'RED'
type Pop = { kind: Kind; name: string; sub: string; photo: string | null; assist?: string }
type BigKind = 'KICKOFF' | 'HT' | 'FT'
const BIG_META: Record<BigKind, { label: string; sub: string }> = {
  KICKOFF: { label: 'ΕΝΑΡΞΗ ΑΓΩΝΑ', sub: 'Καλή διασκέδαση' },
  HT:      { label: 'ΗΜΙΧΡΟΝΟ',     sub: 'Τα ξαναλέμε σε λίγο' },
  FT:      { label: 'ΤΕΛΙΚΟ',       sub: 'Τελικό αποτέλεσμα' },
}
type Sub = { side: 'a' | 'b'; outName: string; inName: string; team: string; min: string }
const POP_META: Record<Kind, { icon: string; label: string; bg: [string, string] }> = {
  GOAL:   { icon: '⚽', label: 'ΓΚΟΛ',          bg: ['', ''] },
  YELLOW: { icon: '🟨', label: 'ΚΙΤΡΙΝΗ ΚΑΡΤΑ', bg: ['#F2C230', '#D8A21F'] },
  RED:    { icon: '🟥', label: 'ΚΟΚΚΙΝΗ ΚΑΡΤΑ', bg: ['#D8483C', '#B23227'] },
}

export default function OverlayPage() {
  return <Suspense><Overlay /></Suspense>
}

function Overlay() {
  const { matchId } = useParams()
  const params = useSearchParams()
  const { match, events } = useLiveMatch(matchId as string)
  const now = useNow(1000)

  const userScale = parseFloat(params.get('scale') || '0.91') || 0.91
  const pos = params.get('pos') || 'tl'
  const preview = params.get('preview') != null
  const urlSponsors = (params.get('sponsors') || '').split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean)
  const [dbSponsors, setDbSponsors] = useState<string[]>([])
  const sponsors = urlSponsors.length ? urlSponsors : dbSponsors

  const [popup, setPopup] = useState<Pop | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const popTimer = useRef<ReturnType<typeof setTimeout>>()
  const [flash, setFlash] = useState<string | null>(null)
  const [lineupsOn, setLineupsOn] = useState(false)
  const [luTeam, setLuTeam] = useState<'a' | 'b'>('a')
  const [squadMap, setSquadMap] = useState<Record<string, any>>({})
  const [bigCard, setBigCard] = useState<BigKind | null>(null)
  const [subCard, setSubCard] = useState<Sub | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  const bigTimer = useRef<ReturnType<typeof setTimeout>>()
  const subTimer = useRef<ReturnType<typeof setTimeout>>()
  const prevCP = useRef<string | null | undefined>(undefined)
  const prevSubTs = useRef<number>(0)
  const supa = useRef(createClient())

  // Καμβάς σχεδίασης 1280×720· κλιμακώνεται για να γεμίσει την πραγματική οθόνη/OBS
  const REF_W = 1280, REF_H = 720
  const [pscale, setPscale] = useState(0.3)
  // callback ref: στήνει τη μέτρηση τη στιγμή που το stage μπαίνει στο DOM
  // (το component κάνει early-return όσο δεν έχει φορτώσει ο αγώνας, οπότε
  //  ένα effect με deps [preview] δεν θα προλάβαινε ποτέ το πραγματικό node)
  const cleanupRef = useRef<() => void>()
  const setStage = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = undefined
    if (!el) return
    const calc = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setPscale(p => (Math.abs(p - w / REF_W) > 0.002 ? w / REF_W : p))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    window.addEventListener('resize', calc)
    window.addEventListener('orientationchange', calc)
    window.visualViewport?.addEventListener('resize', calc)
    const iv = setInterval(calc, 300)
    cleanupRef.current = () => {
      ro.disconnect()
      window.removeEventListener('resize', calc)
      window.removeEventListener('orientationchange', calc)
      window.visualViewport?.removeEventListener('resize', calc)
      clearInterval(iv)
    }
  }, [])

  // Κλίμακα πραγματικού overlay (OBS): γεμίζει το πλάτος της οθόνης
  const [realFit, setRealFit] = useState(1)
  useEffect(() => {
    if (preview) return
    const calc = () => setRealFit(window.innerWidth / REF_W)
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [preview])

  useEffect(() => {
    if (preview) return
    const b = document.body.style.background
    const h = document.documentElement.style.background
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    return () => { document.body.style.background = b; document.documentElement.style.background = h }
  }, [preview])

  useEffect(() => {
    const ch = supa.current.channel(`overlay:${matchId}`)
      .on('broadcast', { event: 'flash' }, ({ payload }: any) => {
        if (payload?.kind === 'LINEUPS') { setLineupsOn(false); setTimeout(() => setLineupsOn(true), 30); return }
        setFlash(payload?.kind ?? null)
        clearTimeout(flashTimer.current)
        if (payload?.kind) flashTimer.current = setTimeout(() => setFlash(null), 6000)
      }).subscribe()
    return () => { supa.current.removeChannel(ch) }
  }, [matchId])

  // Χορηγοί από τη βάση (καθολικοί) — αν δεν δόθηκαν στο URL
  useEffect(() => {
    if (urlSponsors.length) return
    supa.current.from('app_settings').select('sponsors').eq('id', 1).maybeSingle()
      .then(({ data }: any) => { if (data?.sponsors?.length) setDbSponsors(data.sponsors) })
  }, [])

  // Συνθέσεις: 5 δευτ. ομάδα Α, 5 δευτ. ομάδα Β, μετά εξαφανίζεται μόνο του
  useEffect(() => {
    if (!lineupsOn) return
    setLuTeam('a')
    const t1 = setTimeout(() => setLuTeam('b'), 5000)
    const t2 = setTimeout(() => setLineupsOn(false), 10000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [lineupsOn])

  useEffect(() => {
    if (!match) return
    const ids = [...(match.squad_a ?? []), ...(match.squad_b ?? [])]
    if (!ids.length) return
    supa.current.from('players').select('player_id, full_name, number, photo_url').in('player_id', ids)
      .then(({ data }) => {
        const m: Record<string, any> = {}
        ;(data ?? []).forEach((p: any) => { m[p.player_id] = p })
        setSquadMap(m)
      })
  }, [match?.match_id])

  // Αυτόματα γραφικά από το ρολόι: Έναρξη / Ημίχρονο / Τελικό
  useEffect(() => {
    const cp = match?.clock_period
    if (prevCP.current === undefined) { prevCP.current = cp ?? null; return } // αγνόησε το πρώτο render
    if (cp === prevCP.current) return
    const prev = prevCP.current
    prevCP.current = cp ?? null
    let kind: BigKind | null = null
    if (cp === 'H1' && (prev == null || prev === 'FT')) kind = 'KICKOFF'
    else if (cp === 'HT') kind = 'HT'
    else if (cp === 'FT') kind = 'FT'
    if (!kind) return
    setBigCard(kind)
    clearTimeout(bigTimer.current)
    bigTimer.current = setTimeout(() => setBigCard(null), kind === 'KICKOFF' ? 8000 : 11000)
  }, [match?.clock_period])

  // Αυτόματη κάρτα αλλαγής (IN/OUT) όταν προστίθεται νέα αλλαγή
  useEffect(() => {
    const subs = match?.subs as any[] | undefined
    if (!subs?.length) return
    const last = subs[subs.length - 1]
    const ts = last?.ts ?? 0
    if (prevSubTs.current === 0) { prevSubTs.current = ts; return } // αγνόησε τις υπάρχουσες στο load
    if (ts <= prevSubTs.current) return
    prevSubTs.current = ts
    const team = last.side === 'a' ? match.team_a_data?.name : match.team_b_data?.name
    setSubCard({
      side: last.side,
      inName: squadMap[last.in]?.full_name ?? '—',
      outName: squadMap[last.out]?.full_name ?? '—',
      team: team ?? '',
      min: fmtMinute(last.period as Period, last.minute),
    })
    clearTimeout(subTimer.current)
    subTimer.current = setTimeout(() => setSubCard(null), 6500)
  }, [match?.subs, squadMap])

  useEffect(() => {
    if (!match) return
    const kinds: Kind[] = ['GOAL', 'YELLOW', 'RED']
    const rel = events.filter((e: any) => kinds.includes(e.event_type))
    const fresh = rel.filter((g: any) => !seen.current.has(g.event_id))
    fresh.forEach((g: any) => seen.current.add(g.event_id))
    const recent = fresh.filter((g: any) => Date.now() - new Date(g.created_at).getTime() < 20000)
    if (recent.length) {
      const g = recent[recent.length - 1]
      const team = g.team_id === match.team_a ? match.team_a_data?.name : match.team_b_data?.name
      // Ασίστ: ζευγάρωμα με γκολ ίδιας ομάδας/ημιχρόνου στο ίδιο λεπτό
      const assist = g.event_type === 'GOAL'
        ? events.find((e: any) => e.event_type === 'ASSIST' && e.team_id === g.team_id
            && e.period === g.period && Math.abs((e.minute ?? 0) - (g.minute ?? 0)) <= 1)?.player?.full_name
        : undefined
      setPopup({
        kind: g.event_type as Kind,
        name: g.player?.full_name ?? POP_META[g.event_type as Kind].label,
        sub: `${(team ?? '').toUpperCase()} · ${fmtMinute(g.period as Period, g.minute)}`,
        photo: g.player?.photo_url ?? null,
        assist: assist || undefined,
      })
      clearTimeout(popTimer.current)
      popTimer.current = setTimeout(() => setPopup(null), 5500)
    }
  }, [events, match])

  if (!match) return null

  const t = themeFor(match.league_id, params.get('theme'))
  const clk = clockLabel(match.clock_period, match.clock_started_at, now)
  const half = clockHalf(match.clock_period)
  const PP: 'fixed' | 'absolute' = 'absolute'

  const M = Number.isFinite(parseInt(params.get('margin') || '')) ? parseInt(params.get('margin')!) : 0
  const posStyle: React.CSSProperties =
    pos === 'tl' ? { top: M, left: M, alignItems: 'flex-start' }
    : pos === 'tr' ? { top: M, right: M, alignItems: 'flex-end' }
    : pos === 'br' ? { bottom: M, right: M, alignItems: 'flex-end' }
    : { bottom: M, left: M, alignItems: 'flex-start' }
  const tOrigin = pos === 'tl' ? 'top left' : pos === 'tr' ? 'top right'
    : pos === 'br' ? 'bottom right' : 'bottom left'

  const Crest = ({ name, logo, size }: { name?: string; logo?: string | null; size: number }) => (
    <span style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
      fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.14)',
      border: '2px solid rgba(255,255,255,.85)', overflow: 'hidden', flex: 'none', fontSize: size * 0.4 }}>
      {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : (name?.[0] ?? '?').toUpperCase()}
    </span>
  )

  const popBg = popup ? (popup.kind === 'GOAL' ? [t.acc, t.acc2] : POP_META[popup.kind].bg) : ['', '']

  const styleTag = (
    <style>{`
      @keyframes ovGoal{from{opacity:0;transform:translate(-50%,-12px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
      @keyframes ovMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      @keyframes ovPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
    `}</style>
  )

  const luLine: string[] = ((luTeam === 'a' ? match.lineup_a : match.lineup_b) ?? [])
  const luForm = (luTeam === 'a' ? match.formation_a : match.formation_b) ?? '3-3-1'
  const luName = luTeam === 'a' ? match.team_a_data?.name : match.team_b_data?.name
  const luLogo = luTeam === 'a' ? match.team_a_data?.logo_url : match.team_b_data?.logo_url
  const lineupsEl = lineupsOn && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div key={luTeam} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        width: 360, marginTop: 56, animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        {/* Όνομα ομάδας — μέσα στη στοίβα, ώστε τίτλος+γήπεδο να κεντράρονται μαζί */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11 }}>
          <Crest name={luName} logo={luLogo} size={44} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 27, fontWeight: 800, textTransform: 'uppercase', color: '#fff',
              lineHeight: 1.05, textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>{luName}</div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.14em', color: t.acc }}>
              {luForm} · ΣΥΝΘΕΣΗ</div>
          </div>
        </div>
        <LineupPitch formation={luForm} line={luLine} players={squadMap} accent={t.acc}
          bg="rgba(6,16,11,0.4)" borderColor={t.acc} />
      </div>
    </div>
  )

  const varEl = flash === 'VAR' && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '24px 44px', borderRadius: 18,
        background: 'linear-gradient(180deg,#1436b0,#0b2170)', color: '#fff',
        border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 22px 64px rgba(0,0,0,.6)',
        animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        <span style={{ fontSize: 48 }}>📺</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '.28em', opacity: .9 }}>VAR</div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.05 }}>Έλεγχος φάσης</div>
        </div>
      </div>
    </div>
  )

  // Κάρτα αλλαγής (IN ▲ / OUT ▼) — κέντρο οθόνης, όπως VAR/Συνθέσεις
  const subCardEl = subCard && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 34px', borderRadius: 16,
        background: 'rgba(6,10,16,.93)', border: '2px solid #35c66b', color: '#fff', whiteSpace: 'nowrap',
        boxShadow: '0 22px 64px rgba(0,0,0,.6)', animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        <span style={{ fontSize: 44 }}>🔄</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.18em', color: '#9fe6bb' }}>
            ΑΛΛΑΓΗ · {(subCard.team || '').toUpperCase()} · {subCard.min}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: '#35c66b', fontSize: 20, fontWeight: 900 }}>▲</span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{subCard.inName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: '#e0563c', fontSize: 20, fontWeight: 900 }}>▼</span>
            <span style={{ fontSize: 19, fontWeight: 700, opacity: .75 }}>{subCard.outName}</span>
          </div>
        </div>
      </div>
    </div>
  )

  // Μεγάλη κάρτα από το ρολόι: Έναρξη / Ημίχρονο / Τελικό (+ χορηγοί στο διάλειμμα)
  const bigCardEl = bigCard && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none',
      background: 'rgba(3,6,10,.5)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        padding: '32px 54px', borderRadius: 22, background: 'rgba(6,12,18,.94)', border: `2px solid ${t.acc}`,
        boxShadow: '0 30px 90px rgba(0,0,0,.65)', animation: 'ovPop .5s cubic-bezier(.2,.9,.25,1) forwards' }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '.3em', color: t.acc, textTransform: 'uppercase' }}>
          {match.league?.name}</div>
        <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: '.14em', color: '#fff', lineHeight: 1 }}>
          {BIG_META[bigCard].label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Crest name={match.team_a_data?.name} logo={match.team_a_data?.logo_url} size={54} />
            <span style={{ fontSize: 24, fontWeight: 800, textTransform: 'uppercase' }}>{match.team_a_data?.name}</span>
          </div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>
            {match.goals_team_a}<span style={{ color: t.acc, margin: '0 12px' }}>·</span>{match.goals_team_b}</div>
          <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 13 }}>
            <Crest name={match.team_b_data?.name} logo={match.team_b_data?.logo_url} size={54} />
            <span style={{ fontSize: 24, fontWeight: 800, textTransform: 'uppercase' }}>{match.team_b_data?.name}</span>
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, opacity: .6 }}>{BIG_META[bigCard].sub}</div>
        {bigCard !== 'KICKOFF' && sponsors.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: 'rgba(255,255,255,.45)' }}>
              POWERED BY</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              {sponsors.map((u, i) => (
                <span key={i} style={{ background: '#fff', borderRadius: 8, padding: '8px 14px', display: 'inline-flex' }}>
                  <img src={u} alt="" style={{ height: 34, display: 'block' }} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const sponsorsEl = sponsors.length > 0 && (
    <div style={{ position: PP, left: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 12,
      transform: 'scale(1.3)', transformOrigin: 'bottom left',
      background: 'rgba(0,0,0,.6)', borderTop: '1px solid rgba(255,255,255,.1)', borderRight: '1px solid rgba(255,255,255,.1)',
      borderRadius: '0 10px 0 0', padding: '8px 14px' }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.7)',
        whiteSpace: 'nowrap' }}>POWERED BY</span>
      <div style={{ width: 200, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 22, width: 'max-content',
          animation: `ovMarquee ${Math.max(8, sponsors.length * 6)}s linear infinite` }}>
          {[...sponsors, ...sponsors].map((u, i) => (
            <span key={i} style={{ background: '#fff', borderRadius: 6, padding: '4px 9px', display: 'inline-flex' }}>
              <img src={u} alt="" style={{ height: 26, display: 'block' }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )

  const scoreEl = (
    <div style={{ position: PP, display: 'flex', flexDirection: 'column', ...posStyle,
      transform: `scale(${userScale})`, transformOrigin: tOrigin,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 13, overflow: 'hidden',
          boxShadow: '0 12px 38px rgba(0,0,0,.55)', fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 22px',
            background: `linear-gradient(180deg, ${t.bg0}, ${t.bg1})`, color: '#fff', height: 70 }}>
            <Crest name={match.team_a_data?.name} logo={match.team_a_data?.logo_url} size={44} />
            <span style={{ fontSize: 24, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {match.team_a_data?.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 26px',
            background: 'rgba(4,6,12,.9)', color: '#fff', fontSize: 44, fontWeight: 800 }}>
            <span>{match.goals_team_a}</span><span style={{ color: t.acc, fontWeight: 700 }}>·</span><span>{match.goals_team_b}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 13, padding: '0 22px',
            background: `linear-gradient(180deg, ${t.bg0}, ${t.bg1})`, color: '#fff' }}>
            <Crest name={match.team_b_data?.name} logo={match.team_b_data?.logo_url} size={44} />
            <span style={{ fontSize: 24, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {match.team_b_data?.name}</span>
          </div>
          {clk && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minWidth: 88, padding: '0 18px', color: '#fff', background: `linear-gradient(180deg, ${t.acc}, ${t.acc2})` }}>
              {half && <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', lineHeight: 1 }}>{half}</span>}
              <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{clk}</span>
            </div>
          )}
        </div>
        {/* Πρωτάθλημα — καρτελάκι κάτω από τη μπάρα */}
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          display: 'inline-flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap',
          background: 'rgba(0,0,0,.72)', border: '1px solid rgba(255,255,255,.10)', borderTop: 'none',
          borderBottom: `3px solid ${t.acc}`, borderRadius: '0 0 10px 10px', padding: '6px 16px' }}>
          <Crest name={match.league?.name} logo={match.league?.logo_url} size={24} />
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
            color: '#fff' }}>{match.league?.name}</span>
        </div>
        {popup && (
          <div style={{ position: 'absolute', left: '50%', top: 'calc(100% + 48px)', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px 14px 14px', borderRadius: 16,
            color: '#fff', whiteSpace: 'nowrap', background: 'rgba(6,10,16,.92)', border: `2px solid ${popBg[0]}`,
            boxShadow: '0 18px 50px rgba(0,0,0,.5)', animation: 'ovGoal .5s cubic-bezier(.2,.9,.25,1) forwards' }}>
            <span style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', flex: 'none',
              background: 'rgba(255,255,255,.08)', border: `2px solid ${popBg[0]}`, display: 'grid',
              placeItems: 'center', fontSize: 30 }}>
              {popup.photo ? <img src={popup.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : POP_META[popup.kind].icon}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.2em', color: popBg[0] }}>
                {POP_META[popup.kind].icon} {POP_META[popup.kind].label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{popup.name}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, opacity: .82, marginTop: 2 }}>{popup.sub}</div>
              {popup.assist && (
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2, color: popBg[0] }}>
                  🅰 ασίστ: <span style={{ color: '#fff' }}>{popup.assist}</span></div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const scene = <>{styleTag}{sponsorsEl}{scoreEl}{subCardEl}{varEl}{lineupsEl}{bigCardEl}</>

  // Πραγματικό OBS: καμβάς 1280×720 κλιμακωμένος να γεμίσει την οθόνη
  if (!preview) return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: REF_W, height: REF_H,
      transformOrigin: 'top left', transform: `scale(${realFit})` }}>
      {scene}
    </div>
  )

  // Προεπισκόπηση: stage 16:9 (όπως θα φαίνεται στην οθόνη) + χειριστήρια από πάνω
  function testPop(kind: Kind) {
    setPopup({ kind, name: 'Δοκιμαστικός Παίκτης',
      sub: `${(match!.team_a_data?.name ?? '').toUpperCase()} · ${clk ?? "45'"}`, photo: null,
      assist: kind === 'GOAL' ? 'Δοκιμαστική Ασίστ' : undefined })
    clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setPopup(null), 5000)
  }
  function testBig(kind: BigKind) {
    setBigCard(kind)
    clearTimeout(bigTimer.current)
    bigTimer.current = setTimeout(() => setBigCard(null), kind === 'KICKOFF' ? 8000 : 11000)
  }
  function testSub() {
    setSubCard({ side: 'a', inName: 'Νέος Παίκτης', outName: 'Παλιός Παίκτης',
      team: match!.team_a_data?.name ?? '', min: clk ?? "70'" })
    clearTimeout(subTimer.current)
    subTimer.current = setTimeout(() => setSubCard(null), 6500)
  }
  const ctlBtn = (bg: string, fg: string, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ background: bg, color: fg, border: 0, borderRadius: 10,
      padding: '8px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#05060a', padding: 16, boxSizing: 'border-box',
      fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.6)',
            textTransform: 'uppercase' }}>Προεπισκόπηση · όπως θα φαίνεται στην οθόνη</span>
          {ctlBtn(t.acc, '#111', '⚽ Γκολ', () => testPop('GOAL'))}
          {ctlBtn(POP_META.YELLOW.bg[0], '#111', '🟨 Κίτρινη', () => testPop('YELLOW'))}
          {ctlBtn(POP_META.RED.bg[0], '#fff', '🟥 Κόκκινη', () => testPop('RED'))}
          {ctlBtn('#1436b0', '#fff', '📺 VAR', () => { setFlash('VAR'); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(null), 6000) })}
          {ctlBtn('#26303f', '#fff', '📋 Συνθέσεις', () => { setLineupsOn(false); setTimeout(() => setLineupsOn(true), 30) })}
          {ctlBtn('#35c66b', '#062', '🔄 Αλλαγή', testSub)}
          {ctlBtn('#0e7a3a', '#fff', '🏁 Έναρξη', () => testBig('KICKOFF'))}
          {ctlBtn('#8a6d1f', '#fff', '⏸ Ημίχρονο', () => testBig('HT'))}
          {ctlBtn('#6d1f1f', '#fff', '🏆 Τελικό', () => testBig('FT'))}
        </div>
        <div ref={setStage} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9',
          borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)',
          background: 'linear-gradient(160deg,#0f2a1c,#0a1512 70%)' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: REF_W, height: REF_H,
            transformOrigin: 'top left', transform: `scale(${pscale})` }}>
            {scene}
          </div>
        </div>
      </div>
    </div>
  )
}

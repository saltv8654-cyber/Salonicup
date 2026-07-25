'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
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
type Pop = { kind: Kind; name: string; sub: string; photo: string | null }
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

  const userScale = parseFloat(params.get('scale') || '1') || 1
  const pos = params.get('pos') || 'tl'
  const preview = params.get('preview') != null
  const sponsors = (params.get('sponsors') || '').split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean)

  const [popup, setPopup] = useState<Pop | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const popTimer = useRef<ReturnType<typeof setTimeout>>()
  const [flash, setFlash] = useState<string | null>(null)
  const [lineupsOn, setLineupsOn] = useState(false)
  const [luTeam, setLuTeam] = useState<'a' | 'b'>('a')
  const [squadMap, setSquadMap] = useState<Record<string, any>>({})
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  const supa = useRef(createClient())

  // Κλίμακα stage προεπισκόπησης (αναφορά 1280×720)
  const REF_W = 1280, REF_H = 720
  const stageRef = useRef<HTMLDivElement>(null)
  const [pscale, setPscale] = useState(0.3)
  useEffect(() => {
    if (!preview) return
    const el = stageRef.current
    if (!el) return
    const calc = () => { const w = el.clientWidth; if (w) setPscale(w / REF_W) }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    window.addEventListener('resize', calc)
    const id = requestAnimationFrame(calc)
    return () => { ro.disconnect(); window.removeEventListener('resize', calc); cancelAnimationFrame(id) }
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
        if (payload?.kind === 'LINEUPS') { setLineupsOn(!!payload.on); return }
        setFlash(payload?.kind ?? null)
        clearTimeout(flashTimer.current)
        if (payload?.kind) flashTimer.current = setTimeout(() => setFlash(null), 6000)
      }).subscribe()
    return () => { supa.current.removeChannel(ch) }
  }, [matchId])

  // Εναλλαγή ομάδας στις συνθέσεις (~3 δευτ. η καθεμία)
  useEffect(() => {
    if (!lineupsOn) return
    setLuTeam('a')
    const iv = setInterval(() => setLuTeam(s => (s === 'a' ? 'b' : 'a')), 3000)
    return () => clearInterval(iv)
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
      setPopup({
        kind: g.event_type as Kind,
        name: g.player?.full_name ?? POP_META[g.event_type as Kind].label,
        sub: `${(team ?? '').toUpperCase()} · ${fmtMinute(g.period as Period, g.minute)}`,
        photo: g.player?.photo_url ?? null,
      })
      clearTimeout(popTimer.current)
      popTimer.current = setTimeout(() => setPopup(null), 5500)
    }
  }, [events, match])

  if (!match) return null

  const t = themeFor(match.league_id, params.get('theme'))
  const clk = clockLabel(match.clock_period, match.clock_started_at, now)
  const half = clockHalf(match.clock_period)
  const PP: 'fixed' | 'absolute' = preview ? 'absolute' : 'fixed'

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
      <div key={luTeam} style={{ width: 400, animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <Crest name={luName} logo={luLogo} size={38} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 23, fontWeight: 800, textTransform: 'uppercase', color: '#fff',
              lineHeight: 1.05, textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>{luName}</div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', color: t.acc }}>
              {luForm} · ΣΥΝΘΕΣΗ</div>
          </div>
        </div>
        <LineupPitch formation={luForm} line={luLine} players={squadMap} accent={t.acc}
          bg="rgba(6,16,11,0.34)" borderColor={t.acc} />
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

  const sponsorsEl = sponsors.length > 0 && (
    <div style={{ position: PP, left: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 12,
      background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 14px' }}>
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
            color: '#fff', whiteSpace: 'nowrap', background: `linear-gradient(180deg, ${popBg[0]}, ${popBg[1]})`,
            boxShadow: '0 18px 50px rgba(0,0,0,.5)', animation: 'ovGoal .5s cubic-bezier(.2,.9,.25,1) forwards' }}>
            <span style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', flex: 'none',
              background: 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.9)', display: 'grid',
              placeItems: 'center', fontSize: 30 }}>
              {popup.photo ? <img src={popup.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : POP_META[popup.kind].icon}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.2em', opacity: .95 }}>
                {POP_META[popup.kind].icon} {POP_META[popup.kind].label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{popup.name}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, opacity: .92, marginTop: 2 }}>{popup.sub}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const scene = <>{styleTag}{lineupsEl}{varEl}{sponsorsEl}{scoreEl}</>

  if (!preview) return scene

  // Προεπισκόπηση: stage 16:9 (όπως θα φαίνεται στην οθόνη) + χειριστήρια από πάνω
  function testPop(kind: Kind) {
    setPopup({ kind, name: 'Δοκιμαστικός Παίκτης',
      sub: `${(match!.team_a_data?.name ?? '').toUpperCase()} · ${clk ?? "45'"}`, photo: null })
    clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setPopup(null), 5000)
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
          {ctlBtn('#26303f', '#fff', '📋 Συνθέσεις', () => setLineupsOn(v => !v))}
        </div>
        <div ref={stageRef} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9',
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

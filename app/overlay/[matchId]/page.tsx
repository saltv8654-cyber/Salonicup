'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'
import { useNow } from '@/lib/hooks/useNow'
import { clockLabel, clockHalf } from '@/lib/clock'
import { fmtMinute } from '@/lib/match'
import type { Period } from '@/lib/types'

type Theme = { acc: string; acc2: string; bg0: string; bg1: string }
const THEMES: Record<string, Theme> = {
  orange: { acc: '#FF7A2F', acc2: '#E05B1F', bg0: '#0e1830', bg1: '#0a1020' },
  yellow: { acc: '#F2C230', acc2: '#D8A21F', bg0: '#1a1608', bg1: '#0e0c05' },
  miami:  { acc: '#ff2d95', acc2: '#d81f7a', bg0: '#1a0d3d', bg1: '#0a0618' },
}
const KEYS = ['orange', 'yellow', 'miami']

/** Σταθερό θέμα ανά πρωτάθλημα (ή override με ?theme=). */
function themeFor(leagueId: string | undefined, override: string | null): Theme {
  if (override && THEMES[override]) return THEMES[override]
  let h = 0
  const s = leagueId ?? ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return THEMES[KEYS[h % 3]]
}

export default function OverlayPage() {
  return <Suspense><Overlay /></Suspense>
}

function Overlay() {
  const { matchId } = useParams()
  const params = useSearchParams()
  const { match, events } = useLiveMatch(matchId as string)
  const now = useNow(1000)

  const scale = parseFloat(params.get('scale') || '1') || 1
  const pos = params.get('pos') || 'bl'

  const [popup, setPopup] = useState<{ name: string; sub: string } | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const popTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const b = document.body.style.background
    const h = document.documentElement.style.background
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    return () => { document.body.style.background = b; document.documentElement.style.background = h }
  }, [])

  // Pop-up στο γκολ (μόνο για νέα γεγονότα)
  useEffect(() => {
    if (!match) return
    const goals = events.filter((e: any) => e.event_type === 'GOAL')
    const fresh = goals.filter((g: any) => !seen.current.has(g.event_id))
    fresh.forEach((g: any) => seen.current.add(g.event_id))
    const recent = fresh.filter((g: any) => Date.now() - new Date(g.created_at).getTime() < 20000)
    if (recent.length) {
      const g = recent[recent.length - 1]
      const team = g.team_id === match.team_a ? match.team_a_data?.name : match.team_b_data?.name
      setPopup({
        name: (g.player?.full_name ?? 'ΓΚΟΛ'),
        sub: `${(team ?? '').toUpperCase()} · ${fmtMinute(g.period as Period, g.minute)}`,
      })
      clearTimeout(popTimer.current)
      popTimer.current = setTimeout(() => setPopup(null), 5000)
    }
  }, [events, match])

  if (!match) return null

  const t = themeFor(match.league_id, params.get('theme'))
  const clk = clockLabel(match.clock_period, match.clock_started_at, now)
  const half = clockHalf(match.clock_period)

  const posStyle: React.CSSProperties =
    pos === 'tl' ? { top: 24, left: 24, transformOrigin: 'top left' }
    : pos === 'tr' ? { top: 24, right: 24, transformOrigin: 'top right' }
    : pos === 'br' ? { bottom: 24, right: 24, transformOrigin: 'bottom right' }
    : { bottom: 24, left: 24, transformOrigin: 'bottom left' }

  const S = {
    crest: (size: number): React.CSSProperties => ({
      width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
      fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.14)',
      border: '2px solid rgba(255,255,255,.85)', overflow: 'hidden', flex: 'none',
      fontSize: size * 0.4,
    }),
  }
  const Crest = ({ name, logo, size }: { name?: string; logo?: string | null; size: number }) => (
    <span style={S.crest(size)}>
      {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : (name?.[0] ?? '?').toUpperCase()}
    </span>
  )

  return (
    <div style={{ position: 'fixed', ...posStyle, transform: `scale(${scale})`,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}>
      <style>{`@keyframes ovGoal{from{opacity:0;transform:translate(-50%,-14px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>

      {/* League chip */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8,
        background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.10)',
        borderLeft: `3px solid ${t.acc}`, borderRadius: 8, padding: '6px 12px 6px 10px' }}>
        <Crest name={match.league?.name} logo={match.league?.logo_url} size={22} />
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.06em',
          textTransform: 'uppercase', color: '#fff' }}>{match.league?.name}</span>
      </div>

      {/* Main bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 10px 34px rgba(0,0,0,.55)', fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 18px',
          background: `linear-gradient(180deg, ${t.bg0}, ${t.bg1})`, color: '#fff', height: 56 }}>
          <Crest name={match.team_a_data?.name} logo={match.team_a_data?.logo_url} size={34} />
          <span style={{ fontSize: 19, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {match.team_a_data?.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '0 20px', background: 'rgba(4,6,12,.9)', color: '#fff', fontSize: 34, fontWeight: 800 }}>
          <span>{match.goals_team_a}</span>
          <span style={{ color: t.acc, fontWeight: 700 }}>·</span>
          <span>{match.goals_team_b}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 11,
          padding: '0 18px', background: `linear-gradient(180deg, ${t.bg0}, ${t.bg1})`, color: '#fff' }}>
          <Crest name={match.team_b_data?.name} logo={match.team_b_data?.logo_url} size={34} />
          <span style={{ fontSize: 19, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {match.team_b_data?.name}
          </span>
        </div>
        {clk && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minWidth: 70, padding: '0 14px', color: '#fff',
            background: `linear-gradient(180deg, ${t.acc}, ${t.acc2})` }}>
            {half && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', lineHeight: 1 }}>{half}</span>}
            <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.1 }}>{clk}</span>
          </div>
        )}
      </div>

      {/* Goal pop-up */}
      {popup && (
        <div style={{ position: 'fixed', left: '50%', top: '14%',
          transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 22px 14px 16px', borderRadius: 14, color: '#fff',
          background: `linear-gradient(180deg, ${t.acc}, ${t.acc2})`,
          boxShadow: '0 18px 50px rgba(0,0,0,.5)', animation: 'ovGoal .5s cubic-bezier(.2,.9,.25,1) forwards' }}>
          <span style={{ fontSize: 34 }}>⚽</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.2em', opacity: .92 }}>ΓΚΟΛ</div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{popup.name}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, opacity: .92, marginTop: 1 }}>{popup.sub}</div>
          </div>
        </div>
      )}
    </div>
  )
}

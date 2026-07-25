'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  GOAL:   { icon: '⚽', label: 'ΓΚΟΛ',          bg: ['', ''] }, // bg από θέμα
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

  const scale = parseFloat(params.get('scale') || '1') || 1
  const pos = params.get('pos') || 'bl'
  const preview = params.get('preview') != null
  const sponsors = (params.get('sponsors') || '').split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean)

  const [popup, setPopup] = useState<Pop | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const popTimer = useRef<ReturnType<typeof setTimeout>>()

  // VAR / flash μέσω realtime broadcast (ο σπίκερ το ενεργοποιεί)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  const supa = useRef(createClient())
  useEffect(() => {
    const ch = supa.current.channel(`overlay:${matchId}`)
      .on('broadcast', { event: 'flash' }, ({ payload }: any) => {
        setFlash(payload?.kind ?? null)
        clearTimeout(flashTimer.current)
        if (payload?.kind) flashTimer.current = setTimeout(() => setFlash(null), 6000)
      }).subscribe()
    return () => { supa.current.removeChannel(ch) }
  }, [matchId])

  useEffect(() => {
    const b = document.body.style.background
    const h = document.documentElement.style.background
    const bg = preview ? 'linear-gradient(160deg,#0f2a1c,#0a1512 70%)' : 'transparent'
    document.body.style.background = bg
    document.documentElement.style.background = preview ? '#0a1512' : 'transparent'
    return () => { document.body.style.background = b; document.documentElement.style.background = h }
  }, [preview])

  // Pop-up σε νέο γκολ / κίτρινη / κόκκινη
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

  const posStyle: React.CSSProperties =
    pos === 'tl' ? { top: 24, left: 24, alignItems: 'flex-start' }
    : pos === 'tr' ? { top: 24, right: 24, alignItems: 'flex-end' }
    : pos === 'br' ? { bottom: 24, right: 24, alignItems: 'flex-end' }
    : { bottom: 24, left: 24, alignItems: 'flex-start' }
  const tOrigin =
    pos === 'tl' ? 'top left' : pos === 'tr' ? 'top right'
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

  function testPop(kind: Kind) {
    setPopup({ kind, name: kind === 'GOAL' ? 'Δοκιμαστικός Παίκτης' : 'Δοκιμαστικός Παίκτης',
      sub: `${(match.team_a_data?.name ?? '').toUpperCase()} · ${clk ?? "45'"}`, photo: null })
    clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setPopup(null), 5000)
  }

  return (
    <div style={{ position: 'fixed', display: 'flex', flexDirection: 'column', ...posStyle,
      transform: `scale(${scale})`, transformOrigin: tOrigin,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}>
      <style>{`
        @keyframes ovGoal{from{opacity:0;transform:translate(-50%,-12px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
        @keyframes ovMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes ovPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
      `}</style>

      {/* VAR / flash — μεγάλο, κεντρικό */}
      {flash === 'VAR' && (
        <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
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
      )}

      {/* Πρωτάθλημα — κεντραρισμένο πάνω από το σκορ */}
      <div style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8,
        background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.10)',
        borderTop: `3px solid ${t.acc}`, borderRadius: 8, padding: '6px 14px' }}>
        <Crest name={match.league?.name} logo={match.league?.logo_url} size={22} />
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.06em',
          textTransform: 'uppercase', color: '#fff' }}>{match.league?.name}</span>
      </div>

      {/* Μπάρα σκορ + pop-up από κάτω */}
      <div style={{ position: 'relative' }}>
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

        {/* Pop-up κάτω από τη λωρίδα */}
        {popup && (
          <div style={{ position: 'absolute', left: '50%', top: 'calc(100% + 10px)',
            transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 26px 14px 14px', borderRadius: 16, color: '#fff', whiteSpace: 'nowrap',
            background: `linear-gradient(180deg, ${popBg[0]}, ${popBg[1]})`,
            boxShadow: '0 18px 50px rgba(0,0,0,.5)', animation: 'ovGoal .5s cubic-bezier(.2,.9,.25,1) forwards' }}>
            <span style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', flex: 'none',
              background: 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.9)',
              display: 'grid', placeItems: 'center', fontSize: 30 }}>
              {popup.photo
                ? <img src={popup.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : POP_META[popup.kind].icon}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.2em', opacity: .95 }}>
                {POP_META[popup.kind].icon} {POP_META[popup.kind].label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{popup.name}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, opacity: .92, marginTop: 2 }}>{popup.sub}</div>
            </div>
          </div>
        )}
      </div>

      {/* Χειριστήρια προεπισκόπησης */}
      {preview && (
        <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, alignItems: 'center', zIndex: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em',
            color: 'rgba(255,255,255,.6)', textTransform: 'uppercase' }}>Προεπισκόπηση</span>
          {(['GOAL', 'YELLOW', 'RED'] as Kind[]).map(k => (
            <button key={k} onClick={() => testPop(k)}
              style={{ background: k === 'GOAL' ? t.acc : POP_META[k].bg[0], color: '#111', border: 0,
                borderRadius: 10, padding: '8px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
                fontFamily: 'inherit' }}>
              {POP_META[k].icon} {k === 'GOAL' ? 'Γκολ' : k === 'YELLOW' ? 'Κίτρινη' : 'Κόκκινη'}
            </button>
          ))}
          <button onClick={() => { setFlash('VAR'); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(null), 6000) }}
            style={{ background: '#1436b0', color: '#fff', border: 0, borderRadius: 10,
              padding: '8px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            📺 VAR
          </button>
        </div>
      )}

      {/* Powered by — χορηγοί με κύλιση (κάτω-αριστερά οθόνης) */}
      {sponsors.length > 0 && (
        <div style={{ position: 'fixed', left: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10,
          padding: '8px 14px', maxWidth: 320 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.7)',
            whiteSpace: 'nowrap' }}>POWERED BY</span>
          <div style={{ width: 200, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 22, width: 'max-content',
              animation: `ovMarquee ${Math.max(8, sponsors.length * 6)}s linear infinite` }}>
              {[...sponsors, ...sponsors].map((u, i) => (
                <span key={i} style={{ background: '#fff', borderRadius: 6, padding: '4px 9px',
                  display: 'inline-flex', alignItems: 'center' }}>
                  <img src={u} alt="" style={{ height: 26, display: 'block' }} />
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

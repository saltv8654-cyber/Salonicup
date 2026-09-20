'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'

const REF_W = 1920, REF_H = 1080

type T = { pink: string }
const LEAGUE_THEMES: { re: RegExp; t: T }[] = [
  { re: /liga/i, t: { pink: '#FFE000' } },
  { re: /master/i, t: { pink: '#2BD46E' } },
  { re: /trophy|skg/i, t: { pink: '#F0463A' } },
  { re: /fantasy/i, t: { pink: '#38A9E8' } },
  { re: /legend/i, t: { pink: '#9B51E0' } },
  { re: /summer/i, t: { pink: '#37E0FF' } },
]
function leagueTheme(name?: string | null): T {
  if (name) for (const { re, t } of LEAGUE_THEMES) if (re.test(name)) return t
  return { pink: '#FF7A2F' }
}

export default function InterviewOverlay() {
  const { matchId } = useParams<{ matchId: string }>()
  const params = useSearchParams()
  const { match } = useLiveMatch(matchId)
  const preview = params.get('preview') != null

  const [userScale, setUserScale] = useState(parseFloat(params.get('scale') || '1.1') || 1.1)
  const [copied, setCopied] = useState(false)

  // Χορηγοί: από URL (?sponsors=) αλλιώς από app_settings (ίδια πηγή με scoreboard)
  const urlSponsors = (params.get('sponsors') || '').split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean)
  const [dbSponsors, setDbSponsors] = useState<string[]>([])
  useEffect(() => {
    if (urlSponsors.length) return
    createClient().from('app_settings').select('sponsors').eq('id', 1).maybeSingle()
      .then(({ data }: any) => setDbSponsors(data?.sponsors ?? []))
  }, [urlSponsors.length])
  const sponsors = urlSponsors.length ? urlSponsors : dbSponsors

  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [pscale, setPscale] = useState(0.3)
  useEffect(() => {
    if (!stage) return
    const upd = () => { const w = stage.clientWidth; if (w > 0) setPscale(w / REF_W) }
    upd()
    const ro = new ResizeObserver(upd); ro.observe(stage)
    return () => ro.disconnect()
  }, [stage])

  if (!match) return null

  const th = leagueTheme(match.league?.name)
  const side: string | null = match.interview_side ?? null
  const a = match.team_a_data, b = match.team_b_data
  const guest = side === 'a' ? a : side === 'b' ? b : null
  const player: string | null = (match.interview_name && String(match.interview_name).trim()) || null
  const mvp = !!match.interview_mvp
  const show = !!guest
  const fade = { opacity: show ? 1 : 0, transition: 'opacity .4s' } as const

  const scene = (
    <div style={{ position: 'absolute', top: 0, left: 0, width: REF_W, height: REF_H, fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @keyframes ovMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes mvpShine{0%{background-position:0% 50%}100%{background-position:220% 50%}}
      `}</style>

      {/* Κάτω κέντρο→δεξιά: κυλιόμενοι χορηγοί (POWERED BY) — διπλάσιο μέγεθος */}
      {sponsors.length > 0 && (
        <div style={{ position: 'absolute', bottom: 44, left: 700, right: 60, display: 'flex', alignItems: 'center', gap: 22,
          background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '14px 26px',
          transform: `scale(${userScale})`, transformOrigin: 'bottom right', ...fade }}>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap' }}>POWERED BY</span>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 44, width: 'max-content',
              animation: `ovMarquee ${Math.max(12, sponsors.length * 7)}s linear infinite` }}>
              {[...sponsors, ...sponsors].map((u, i) => (
                <span key={i} style={{ background: '#fff', borderRadius: 10, padding: '10px 18px', display: 'inline-flex' }}>
                  <img src={u} alt="" style={{ height: 84, display: 'block' }} />
                </span>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* Πάνω-κέντρο: ομάδες + πρωτάθλημα + αγωνιστική */}
      <div style={{ position: 'absolute', top: 44, left: 0, right: 0, display: 'flex', justifyContent: 'center', ...fade }}>
        <div style={{ background: 'rgba(10,10,16,.85)', borderTop: `4px solid ${th.pink}`, borderRadius: 10,
          padding: '12px 34px', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,.5)',
          transform: `scale(${userScale})`, transformOrigin: 'top center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            {a?.logo_url && <img src={a.logo_url} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain' }} />}
            <span style={{ fontSize: 34, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>
              {a?.name ?? '—'} <span style={{ color: th.pink }}>–</span> {b?.name ?? '—'}
            </span>
            {b?.logo_url && <img src={b.logo_url} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain' }} />}
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'rgba(255,255,255,.72)', marginTop: 4,
            textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
            {match.league?.name ?? ''}{match.round ? ` · Αγωνιστική ${match.round}` : ''}
          </div>
        </div>
      </div>

      {/* Πάνω-αριστερά: FLASH INTERVIEW + ΖΩΝΤΑΝΑ */}
      <div style={{ position: 'absolute', top: 170, left: 90, transformOrigin: 'top left',
        transform: `scale(${userScale})`, display: 'flex', alignItems: 'center', gap: 16, ...fade }}>
        <span style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: '1px',
          textShadow: '0 4px 18px rgba(0,0,0,.6)' }}>FLASH INTERVIEW</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(10,10,16,.82)', padding: '7px 14px', borderRadius: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff2d2d', boxShadow: '0 0 12px #ff2d2d' }} />
          <span style={{ fontSize: 22, fontWeight: 900, color: '#ff2d2d', letterSpacing: '2px' }}>ΖΩΝΤΑΝΑ</span>
        </span>
      </div>

      {/* Κάτω-αριστερά: όνομα παίκτη (μεγάλο) + ομάδα */}
      <div style={{ position: 'absolute', bottom: 90, left: 90, transformOrigin: 'bottom left',
        transform: `scale(${userScale})`, display: 'flex', alignItems: 'center', gap: 18,
        background: 'rgba(10,10,16,.82)', borderLeft: `10px solid ${th.pink}`,
        padding: '14px 34px 14px 22px', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,.5)', ...fade }}>
        {guest?.logo_url && <img src={guest.logo_url} alt="" width={62} height={62} style={{ width: 62, height: 62, objectFit: 'contain' }} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mvp && (
            <span style={{ fontSize: 78, fontWeight: 900, letterSpacing: '10px', lineHeight: 1, marginBottom: 6,
              backgroundImage: 'linear-gradient(100deg, #C8901A 0%, #F7DE7A 20%, #FFF6D0 34%, #E8B923 50%, #B8860B 62%, #FBE99A 80%, #C8901A 100%)',
              backgroundSize: '220% 100%',
              WebkitBackgroundClip: 'text', backgroundClip: 'text',
              WebkitTextFillColor: 'transparent', color: 'transparent',
              filter: 'drop-shadow(0 3px 10px rgba(232,185,35,.5))',
              animation: 'mvpShine 3.5s linear infinite' }}>MVP</span>
          )}
          <span style={{ fontSize: player ? 46 : 40, fontWeight: 800, color: '#fff', textTransform: 'uppercase',
            letterSpacing: '.5px', whiteSpace: 'nowrap', lineHeight: 1 }}>
            {player ?? guest?.name ?? ''}
          </span>
          {player && (
            <span style={{ fontSize: 24, fontWeight: 700, color: th.pink, textTransform: 'uppercase',
              letterSpacing: '1px', whiteSpace: 'nowrap' }}>{guest?.name ?? ''}</span>
          )}
        </div>
      </div>
    </div>
  )

  if (!preview) {
    return <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>{scene}</div>
  }

  const supabase = createClient()
  const setSide = (s: 'a' | 'b' | null) =>
    supabase.from('matches').update({ interview_side: s, interview_name: s ? match.interview_name : null })
      .eq('match_id', matchId).then(() => {}, () => {})

  const copyLink = () => {
    const q = new URLSearchParams()
    q.set('scale', userScale.toFixed(2))
    navigator.clipboard?.writeText(`${window.location.origin}/overlay/interview/${matchId}?${q.toString()}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const btn = (active: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ background: active ? th.pink : '#1b2130', color: '#fff', border: 0,
      borderRadius: 9, padding: '8px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0e', color: '#fff', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,.6)', margin: '0 0 12px' }}>
        ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΣΥΝΕΝΤΕΥΞΗΣ · ΟΠΩΣ ΘΑ ΦΑΙΝΕΤΑΙ ΣΤΗΝ ΟΘΟΝΗ
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {btn(side === 'a', a?.name ?? 'Ομάδα Α', () => setSide('a'))}
        {btn(side === 'b', b?.name ?? 'Ομάδα Β', () => setSide('b'))}
        {btn(!side, 'Κρύψε', () => setSide(null))}
        {btn(mvp, '🏆 MVP', () => supabase.from('matches').update({ interview_mvp: !mvp }).eq('match_id', matchId).then(() => {}, () => {}))}
      </div>

      <div ref={setStage} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9',
        borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)',
        background: 'linear-gradient(160deg,#12131a,#0a0b10 70%)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: REF_W, height: REF_H, transformOrigin: 'top left', transform: `scale(${pscale})` }}>
          {scene}
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#0d1017',
        border: '1px solid rgba(255,255,255,.10)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, minWidth: 92 }}>
            Μέγεθος <span style={{ color: th.pink }}>{Math.round(userScale * 100)}%</span></span>
          <input type="range" min={0.6} max={2.2} step={0.05} value={userScale}
            onChange={e => setUserScale(parseFloat(e.target.value))}
            style={{ flex: 1, minWidth: 180, accentColor: th.pink }} />
        </div>
        <button onClick={copyLink}
          style={{ background: th.pink, color: '#0b0b0e', border: 0, borderRadius: 10, padding: 12,
            fontWeight: 900, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
          {copied ? '✓ Αντιγράφηκε — βάλ\'το στο OBS' : '📺 Αντιγραφή OBS link (με αυτό το μέγεθος)'}
        </button>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', margin: 0, lineHeight: 1.5 }}>
          Ρύθμισε το μέγεθος, αντίγραψε το link και βάλ' το ως Browser Source στο OBS (1920×1080).
        </p>
      </div>
    </div>
  )
}

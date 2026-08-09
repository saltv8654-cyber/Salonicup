import { ImageResponse } from 'next/og'
import { createElement as hh } from 'react'
import { dbAdmin, loadFonts, C } from '../shared'
import { slotCoords } from '@/lib/formations'

const JERSEY_PATH = 'M35 8 L18 18 L8 38 L22 48 L33 40 L33 92 L67 92 L67 40 L78 48 L92 38 L82 18 L65 8 L58 15 C53 19 47 19 42 15 Z'
// Φανέλα (SVG) με μοτίβο ομάδας: μονόχρωμο / ρίγες / μισό-μισό
function jerseySvg(id: string, primary: string, secondary: string | null, pattern: string) {
  let fill: string = primary, defs: any = null
  if (pattern === 'halves' && secondary) {
    defs = hh('defs', null, hh('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '0' },
      hh('stop', { offset: '50%', 'stop-color': primary }), hh('stop', { offset: '50%', 'stop-color': secondary })))
    fill = `url(#${id})`
  } else if (pattern === 'stripes' && secondary) {
    const cols = [primary, secondary]; const stops: any[] = []
    for (let k = 0; k < 6; k++) {
      stops.push(hh('stop', { key: 'a' + k, offset: `${(k / 6 * 100).toFixed(2)}%`, 'stop-color': cols[k % 2] }),
        hh('stop', { key: 'b' + k, offset: `${((k + 1) / 6 * 100).toFixed(2)}%`, 'stop-color': cols[k % 2] }))
    }
    defs = hh('defs', null, hh('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '0' }, stops))
    fill = `url(#${id})`
  }
  return hh('svg', { width: 136, height: 136, viewBox: '0 0 100 100' }, defs,
    hh('path', { d: JERSEY_PATH, fill, stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }))
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// «Ομάδα της αγωνιστικής» — εικόνα Premier-League style (Post ή Story).
// ?ids=...&formation=3-3-1&size=post|story|square&league=..&leagueLogo=..&title=..&sub=..&accent=%23..

const SIZES: Record<string, { W: number; H: number }> = {
  post: { W: 1080, H: 1350 }, story: { W: 1080, H: 1920 }, square: { W: 1080, H: 1080 },
}
function idealText(hex: string) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#141414' : '#fff'
}
function positionLabels(formation: string): string[] {
  const rows = formation.split('-').map(n => parseInt(n)).filter(n => n > 0)
  const labels = ['GK']; const n = rows.length
  rows.forEach((count, ri) => {
    const kind = ri === 0 ? 'D' : ri === n - 1 ? 'F' : 'M'
    for (let i = 0; i < count; i++) {
      const left = i === 0, right = i === count - 1
      if (count === 1) labels.push(kind === 'D' ? 'CB' : kind === 'F' ? 'CF' : 'MF')
      else if (kind === 'D') labels.push(left ? 'LB' : right ? 'RB' : 'CB')
      else if (kind === 'M') labels.push(left ? 'LW' : right ? 'RW' : 'MF')
      else labels.push(left ? 'LW' : right ? 'RW' : 'CF')
    }
  })
  return labels
}
const surnameOf = (p: any) =>
  ((p?.last_name?.trim() || (p?.full_name || '').trim().split(/\s+/)[0]) || '—').toUpperCase()

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const url = new URL(req.url)
  const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim())
  const idsQuery = ids.filter(Boolean)
  const formation = url.searchParams.get('formation') || '3-3-1'
  const size = url.searchParams.get('size') || 'post'
  const league = url.searchParams.get('league') || ''
  const leagueLogo = url.searchParams.get('leagueLogo') || ''
  const title = url.searchParams.get('title') || 'TEAM OF THE WEEK'
  const sub = url.searchParams.get('sub') || ''
  const accent = url.searchParams.get('accent') || C.brand

  try {
    const supabase = dbAdmin()
    const { data } = idsQuery.length
      ? await supabase.from('players')
          .select('player_id, full_name, last_name, number, photo_url, team:team_id(name, logo_url, kit_primary, kit_secondary, kit_pattern)')
          .in('player_id', idsQuery)
      : { data: [] as any[] }
    const byId: Record<string, any> = {}
    ;(data ?? []).forEach((p: any) => { byId[p.player_id] = p })

    const { data: settings } = await supabase.from('app_settings').select('sponsors').eq('id', 1).maybeSingle()
    const sponsors: string[] = ((settings?.sponsors ?? []) as string[]).filter(Boolean)
    const footerH = sponsors.length ? 92 : 0

    const { W, H } = SIZES[size] || SIZES.post
    const coords = slotCoords(formation)
    const uniqY = [...new Set(coords.map(c => c.y))].sort((a, b) => b - a)
    const yTop = 0.15, yBot = 0.84, L = uniqY.length
    const yMap = new Map<number, number>()
    uniqY.forEach((y, k) => yMap.set(y, L <= 1 ? 0.5 : yBot - k * ((yBot - yTop) / (L - 1))))
    const labels = positionLabels(formation)

    const margin = 36, headerH = 250, NODE = 176
    const PLEFT = margin, PW = W - 2 * margin
    const availH = H - headerH - margin - footerH
    const PH = Math.min(availH, PW * 1.5)
    const PTOP = headerH + (availH - PH) / 2
    const posText = idealText(accent)

    const fonts = await loadFonts(origin)

    const LINE = 'rgba(255,255,255,0.42)'
    const inset = 22
    const line = (st: any, key: string) => (<div key={key} style={{ position: 'absolute', display: 'flex', ...st }} />)
    // Ρίγες γκαζόν
    const bands = Array.from({ length: 10 }).map((_, i) =>
      line({ left: 0, top: (PH / 10) * i, width: PW, height: PH / 10, background: i % 2 ? '#1c4a2c' : '#20563299' }, 'b' + i))
    const boxW = PW * 0.52, boxH = PH * 0.12, gW = PW * 0.26, gH = PH * 0.05
    const cc = PW * 0.26
    const marks = [
      line({ left: inset, top: inset, width: PW - 2 * inset, height: PH - 2 * inset, border: `3px solid ${LINE}`, borderRadius: 6 }, 'bd'),
      line({ left: inset, top: PH / 2 - 1.5, width: PW - 2 * inset, height: 3, background: LINE }, 'hl'),
      line({ left: PW / 2 - cc / 2, top: PH / 2 - cc / 2, width: cc, height: cc, borderRadius: cc / 2, border: `3px solid ${LINE}` }, 'cc'),
      line({ left: PW / 2 - 5, top: PH / 2 - 5, width: 10, height: 10, borderRadius: 5, background: LINE }, 'cs'),
      // top box + goal area
      line({ left: (PW - boxW) / 2, top: inset, width: boxW, height: boxH, border: `3px solid ${LINE}`, borderTop: 'none' }, 'tb'),
      line({ left: (PW - gW) / 2, top: inset, width: gW, height: gH, border: `3px solid ${LINE}`, borderTop: 'none' }, 'tg'),
      // bottom box + goal area
      line({ left: (PW - boxW) / 2, top: PH - inset - boxH, width: boxW, height: boxH, border: `3px solid ${LINE}`, borderBottom: 'none' }, 'bb'),
      line({ left: (PW - gW) / 2, top: PH - inset - gH, width: gW, height: gH, border: `3px solid ${LINE}`, borderBottom: 'none' }, 'bg'),
    ]

    const posTag = (i: number, top: number, left: number) => (
      <div style={{ position: 'absolute', top, left, display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 46, height: 32, padding: '0 8px', borderRadius: 9, background: accent, color: posText,
        fontSize: 19, fontWeight: 700, border: '3px solid #fff' }}>{labels[i] || ''}</div>
    )

    const res = new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: '#0B0B0E', fontFamily: 'Deja', color: C.chalk }}>
          {leagueLogo ? (
            <img src={leagueLogo} width={132} height={132}
              style={{ position: 'absolute', top: 44, right: 48, width: 132, height: 132, objectFit: 'contain' }} />
          ) : null}
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '42px 48px 0' }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 7, color: C.silver }}>SALONICUP</div>
            {league ? (
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, letterSpacing: 1, color: accent, marginTop: 2 }}>
                {league.toUpperCase()}</div>
            ) : null}
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, marginTop: 2, lineHeight: 1.02 }}>{title}</div>
            {sub ? <div style={{ display: 'flex', fontSize: 30, color: C.silver, marginTop: 6 }}>{sub}</div> : null}
          </div>

          {/* Γήπεδο */}
          <div style={{ position: 'absolute', left: PLEFT, top: PTOP, width: PW, height: PH, display: 'flex',
            borderRadius: 26, overflow: 'hidden', background: '#1e5231',
            border: '2px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 70px rgba(0,0,0,0.5)' }}>
            {bands}{marks}

            {coords.map((c, i) => {
              const p = byId[ids[i]]
              const cy = yMap.get(c.y) ?? c.y
              const left = c.x * PW - NODE / 2
              const top = cy * PH - 96
              const sName = surnameOf(p)
              const nameFs = sName.length > 14 ? 18 : sName.length > 11 ? 21 : 25
              return (
                <div key={i} style={{ position: 'absolute', left, top, width: NODE, display: 'flex',
                  flexDirection: 'column', alignItems: 'center' }}>
                  {(() => {
                    // Όλοι με φανέλα (τύπου BBC) — χρώμα/μοτίβο ομάδας
                    const kit = (p?.team as any) || {}
                    const primary = kit.kit_primary || accent
                    const secondary = kit.kit_secondary || null
                    const pattern = kit.kit_pattern || 'solid'
                    return (
                      <div style={{ position: 'relative', display: 'flex', width: 136, height: 136,
                        alignItems: 'center', justifyContent: 'center' }}>
                        {jerseySvg('kit' + i, primary, secondary, pattern)}
                        <div style={{ position: 'absolute', top: 46, left: 0, right: 0, display: 'flex',
                          justifyContent: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 50,
                            height: 50, padding: '0 10px', borderRadius: 25, background: 'rgba(0,0,0,0.42)',
                            color: '#fff', fontSize: 36, fontWeight: 700 }}>
                            {p?.number != null ? String(p.number) : (p?.full_name?.[0] ?? '')}</div>
                        </div>
                        {posTag(i, 8, 6)}
                      </div>
                    )
                  })()}

                  {/* Πλακέτα ονόματος (PL style) */}
                  <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 12, borderRadius: 10, overflow: 'hidden',
                    background: 'rgba(6,8,12,0.82)', border: '1px solid rgba(255,255,255,0.12)', maxWidth: 320 }}>
                    <div style={{ display: 'flex', width: 6, background: accent }} />
                    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', color: '#fff',
                      fontSize: nameFs, fontWeight: 700, whiteSpace: 'nowrap' }}>{sName}</div>
                  </div>
                  {p?.team?.name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5,
                      background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: '3px 10px', maxWidth: NODE + 46 }}>
                      {p.team.logo_url
                        ? <img src={p.team.logo_url} width={22} height={22} style={{ width: 22, height: 22, objectFit: 'contain' }} />
                        : null}
                      <div style={{ display: 'flex', color: C.silver, fontSize: 18, fontWeight: 700 }}>{p.team.name}</div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* Powered by — χορηγοί */}
          {sponsors.length ? (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, display: 'flex',
              flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, letterSpacing: 6,
                color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>POWERED BY</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {sponsors.map((u, i) => (
                  <div key={i} style={{ display: 'flex', background: '#fff', borderRadius: 10, padding: '8px 16px' }}>
                    <img src={u} width={130} height={44} style={{ width: 130, height: 44, objectFit: 'contain' }} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ),
      { width: W, height: H, fonts }
    )
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return res
  } catch (e: any) {
    return new Response('og error: ' + (e?.message || String(e)), { status: 500 })
  }
}

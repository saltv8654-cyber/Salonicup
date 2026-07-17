import { ImageResponse } from 'next/og'
import { db, loadFonts, C } from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function Crest({ url, name, size }: { url?: string | null; name?: string; size: number }) {
  if (url) {
    return (
      <img src={url} width={size} height={size}
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 16 }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: C.card,
      color: C.silver, fontSize: size * 0.42, fontWeight: 700,
    }}>
      {(name?.[0] ?? '?').toUpperCase()}
    </div>
  )
}

export async function GET(req: Request, { params }: { params: { matchId: string } }) {
  const origin = new URL(req.url).origin
  const supabase = db()

  const { data: m } = await supabase
    .from('matches')
    .select('*, team_a_data:team_a(name,logo_url), team_b_data:team_b(name,logo_url), league:league_id(name)')
    .eq('match_id', params.matchId)
    .single()

  if (!m) return new Response('Not found', { status: 404 })

  const { data: ev } = await supabase
    .from('events')
    .select('event_type, team_id, minute, period, player:player_id(full_name)')
    .eq('match_id', params.matchId)
    .in('event_type', ['GOAL', 'PEN_SCORED'])

  const scorers = (side: string) =>
    (ev ?? [])
      .filter((e: any) => e.team_id === side)
      .map((e: any) => (e.player?.full_name ?? '').split(' ').slice(-1)[0])
      .filter(Boolean)

  const sA = scorers(m.team_a)
  const sB = scorers(m.team_b)
  const hasPens = (m.pens_team_a ?? 0) > 0 || (m.pens_team_b ?? 0) > 0
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)
  const statusLabel = live ? 'LIVE' : done ? 'ΤΕΛΙΚΟ' : 'ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟΣ'

  const fonts = await loadFonts(origin)

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: 'Deja', color: C.chalk, padding: 72,
      }}>
        {/* header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 8, color: C.lit }}>
            SALONICUP
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: C.dim, marginTop: 12 }}>
            {(m.league?.name ?? '')} · Αγ. {m.round}
          </div>
        </div>

        {/* score */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 90, marginBottom: 40,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 340 }}>
            <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={200} />
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, marginTop: 28, textAlign: 'center' }}>
              {m.team_a_data?.name}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: 160, fontWeight: 700, lineHeight: 1 }}>
              {m.goals_team_a}
              <span style={{ color: C.dim, margin: '0 24px' }}>·</span>
              {m.goals_team_b}
            </div>
            {hasPens && (
              <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: C.lit, marginTop: 20 }}>
                πέν. {m.pens_team_a}–{m.pens_team_b}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 340 }}>
            <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={200} />
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, marginTop: 28, textAlign: 'center' }}>
              {m.team_b_data?.name}
            </div>
          </div>
        </div>

        {/* status */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            display: 'flex', background: live ? C.brand : C.turf, color: live ? '#fff' : C.silver,
            padding: '12px 34px', borderRadius: 999, fontSize: 26, fontWeight: 700, letterSpacing: 4,
          }}>
            {statusLabel}
          </div>
        </div>

        {/* scorers */}
        {(sA.length > 0 || sB.length > 0) && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 56,
            borderTop: `2px solid ${C.line}`, paddingTop: 40,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '46%' }}>
              {sA.map((n: string, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: C.silver, marginBottom: 10 }}>
                  <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: C.brand, marginRight: 14 }} />
                  {n}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', width: '46%', alignItems: 'flex-end' }}>
              {sB.map((n: string, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: C.silver, marginBottom: 10 }}>
                  {n}
                  <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: C.brand, marginLeft: 14 }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* footer */}
        <div style={{
          display: 'flex', marginTop: 'auto', justifyContent: 'center',
          fontSize: 24, color: C.dim, letterSpacing: 2,
        }}>
          salonicup.gr
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts }
  )
}

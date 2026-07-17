import { ImageResponse } from 'next/og'
import { db, loadFonts, C } from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { leagueId: string } }) {
  const origin = new URL(req.url).origin
  const supabase = db()

  const [{ data: league }, { data: rows }] = await Promise.all([
    supabase.from('leagues').select('name, season').eq('league_id', params.leagueId).single(),
    supabase.from('standings').select('*').eq('league_id', params.leagueId).order('position'),
  ])

  if (!rows) return new Response('Not found', { status: 404 })

  const fonts = await loadFonts(origin)
  const top = rows.slice(0, 16)

  const Cell = ({ children, w, color = C.silver, align = 'center', bold = false }: any) => (
    <div style={{
      display: 'flex', width: w, justifyContent: align === 'center' ? 'center' : 'flex-start',
      color, fontSize: 30, fontWeight: bold ? 700 : 400,
    }}>
      {children}
    </div>
  )

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: 'Deja', color: C.chalk, padding: 64,
      }}>
        {/* header */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 8, color: C.lit }}>
            SALONICUP · ΒΑΘΜΟΛΟΓΙΑ
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 }}>
            <div style={{ display: 'flex', fontSize: 54, fontWeight: 700 }}>{league?.name ?? ''}</div>
            <div style={{ display: 'flex', fontSize: 28, color: C.dim }}>{league?.season ?? ''}</div>
          </div>
        </div>

        {/* table head */}
        <div style={{
          display: 'flex', alignItems: 'center', marginTop: 40, paddingBottom: 16,
          borderBottom: `2px solid ${C.line}`, color: C.dim, fontSize: 24, fontWeight: 700,
        }}>
          <div style={{ display: 'flex', width: 60 }}>#</div>
          <div style={{ display: 'flex', flex: 1 }}>ΟΜΑΔΑ</div>
          <div style={{ display: 'flex', width: 70, justifyContent: 'center' }}>Α</div>
          <div style={{ display: 'flex', width: 70, justifyContent: 'center' }}>Ν</div>
          <div style={{ display: 'flex', width: 70, justifyContent: 'center' }}>Ι</div>
          <div style={{ display: 'flex', width: 70, justifyContent: 'center' }}>Η</div>
          <div style={{ display: 'flex', width: 90, justifyContent: 'center' }}>ΔΓ</div>
          <div style={{ display: 'flex', width: 90, justifyContent: 'center', color: C.lit }}>ΒΑΘ</div>
        </div>

        {/* rows */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {top.map((t: any, i: number) => (
            <div key={t.team_id} style={{
              display: 'flex', alignItems: 'center', padding: '16px 12px', borderRadius: 12,
              marginTop: 6, background: i === 0 ? 'rgba(245,120,46,0.14)' : C.turf,
            }}>
              <Cell w={60} bold color={i === 0 ? C.lit : i < 3 ? C.silver : C.dim}>{t.position}</Cell>
              <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                {t.logo_url
                  ? <img src={t.logo_url} width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain', marginRight: 18 }} />
                  : <div style={{ display: 'flex', width: 40, height: 40, marginRight: 18 }} />}
                <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, color: C.chalk }}>{t.team_name}</div>
              </div>
              <Cell w={70} color={C.dim}>{t.played}</Cell>
              <Cell w={70}>{t.wins}</Cell>
              <Cell w={70} color={C.dim}>{t.draws}</Cell>
              <Cell w={70} color={C.dim}>{t.losses}</Cell>
              <Cell w={90} color={t.goal_diff > 0 ? C.lit : t.goal_diff < 0 ? '#9E5148' : C.dim}>
                {t.goal_diff > 0 ? `+${t.goal_diff}` : t.goal_diff}
              </Cell>
              <Cell w={90} bold color={C.chalk}>{t.points}</Cell>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', marginTop: 'auto', justifyContent: 'center', fontSize: 24, color: C.dim, letterSpacing: 2 }}>
          salonicup.gr
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts }
  )
}

import { db } from '../../og/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=60',
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  })
}

/**
 * Δημόσιο API φωτογραφιών αγώνα — για κατανάλωση από το salonicup.gr.
 *   /api/public/photos                → πρόσφατοι αγώνες με φωτο (limit)
 *   /api/public/photos?match=<id>     → φωτο ενός αγώνα
 *   /api/public/photos?league=<id>    → αγώνες πρωταθλήματος με φωτο
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const matchId = url.searchParams.get('match')
    const leagueId = url.searchParams.get('league')
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '40')))
    const supabase = db()

    const MSEL = `match_id, match_date, match_status, goals_team_a, goals_team_b, league_id,
      league:league_id(name, logo_url), team_a_data:team_a(name, logo_url), team_b_data:team_b(name, logo_url)`

    const packMatch = (m: any, photos: any[]) => ({
      match_id: m.match_id,
      date: m.match_date,
      status: m.match_status,
      league: { id: m.league_id, name: (m.league as any)?.name ?? null, logo: (m.league as any)?.logo_url ?? null },
      home: { name: (m.team_a_data as any)?.name ?? null, logo: (m.team_a_data as any)?.logo_url ?? null },
      away: { name: (m.team_b_data as any)?.name ?? null, logo: (m.team_b_data as any)?.logo_url ?? null },
      score: ['Played', 'Forfeit'].includes(m.match_status)
        ? { home: m.goals_team_a ?? 0, away: m.goals_team_b ?? 0 } : null,
      photos: photos.map(p => ({ url: p.url })),
    })

    // Ένας αγώνας
    if (matchId) {
      const [{ data: ph }, { data: m }] = await Promise.all([
        supabase.from('match_photos').select('url, sort, created_at').eq('match_id', matchId)
          .order('sort').order('created_at'),
        supabase.from('matches').select(MSEL).eq('match_id', matchId).maybeSingle(),
      ])
      if (!m) return json({ error: 'not found' }, 404)
      return json(packMatch(m, ph ?? []))
    }

    // Ποιοι αγώνες έχουν φωτο
    let pq = supabase.from('match_photos').select('match_id, url, sort, created_at')
      .order('created_at', { ascending: false })
    const { data: allPhotos } = await pq
    const byMatch = new Map<string, any[]>()
    for (const p of allPhotos ?? []) {
      if (!byMatch.has(p.match_id)) byMatch.set(p.match_id, [])
      byMatch.get(p.match_id)!.push(p)
    }
    let matchIds = [...byMatch.keys()]
    if (!matchIds.length) return json({ matches: [] })

    let mq = supabase.from('matches').select(MSEL).in('match_id', matchIds)
    if (leagueId) mq = mq.eq('league_id', leagueId)
    mq = mq.order('match_date', { ascending: false }).limit(limit)
    const { data: ms } = await mq

    const matches = (ms ?? []).map((m: any) => {
      const photos = (byMatch.get(m.match_id) ?? []).slice()
        .sort((a, b) => (a.sort - b.sort) || String(a.created_at).localeCompare(String(b.created_at)))
      return packMatch(m, photos)
    })
    return json({ matches })
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500)
  }
}

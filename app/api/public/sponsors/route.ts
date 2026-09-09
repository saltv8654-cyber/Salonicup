import { db } from '../../og/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=120',
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
 * Δημόσιο API χορηγών — για κατανάλωση από το salonicup.gr.
 *   /api/public/sponsors → { major: [{name, logo}], minor: [{name, logo}] }
 */
export async function GET() {
  try {
    const supabase = db()
    const { data } = await supabase.from('sponsors')
      .select('name, logo_url, link_url, tier, sort, created_at')
      .order('sort').order('created_at')
    const pack = (s: any) => ({ name: s.name || null, logo: s.logo_url || null, link: s.link_url || null })
    const rows = data ?? []
    return json({
      major: rows.filter(s => s.tier === 'major').map(pack),
      minor: rows.filter(s => s.tier !== 'major').map(pack),
    })
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500)
  }
}

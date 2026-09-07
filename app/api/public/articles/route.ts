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

const pack = (a: any) => ({
  id: a.id,
  title: a.title || null,
  body: a.body || '',
  cover: a.cover_url || null,
  date: a.created_at,
  updated: a.updated_at,
})

/**
 * Δημόσιο API άρθρων — για κατανάλωση από το salonicup.gr.
 *   /api/public/articles              → δημοσιευμένα άρθρα (limit)
 *   /api/public/articles?id=<id>      → ένα άρθρο
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30')))
    const supabase = db()

    if (id) {
      const { data } = await supabase.from('articles')
        .select('id, title, body, cover_url, created_at, updated_at, published')
        .eq('id', id).maybeSingle()
      if (!data || !data.published) return json({ error: 'not found' }, 404)
      return json(pack(data))
    }

    const { data } = await supabase.from('articles')
      .select('id, title, body, cover_url, created_at, updated_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(limit)
    return json({ articles: (data ?? []).map(pack) })
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500)
  }
}

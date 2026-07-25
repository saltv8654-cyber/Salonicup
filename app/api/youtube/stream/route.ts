import { NextResponse } from 'next/server'
import { createClient as createServer, createAdminClient } from '@/lib/supabase/server'
import { ytConfigured, ytAccessToken, ytCreateBroadcast } from '@/lib/youtube-api'
import { ytWatch } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Δημιουργεί ζωντανή μετάδοση για έναν αγώνα και γεμίζει το stream_url. */
export async function POST(req: Request) {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const { data: profile } = await server.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'speaker'].includes(profile.role)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
  if (!ytConfigured()) return NextResponse.json({ ok: false, reason: 'not-configured' })

  const { matchId, channelId, privacy } = await req.json().catch(() => ({} as any))
  if (!matchId || !channelId) return NextResponse.json({ ok: false, reason: 'bad-request' }, { status: 400 })
  const priv = ['public', 'unlisted', 'private'].includes(privacy) ? privacy : 'public'

  const db = createAdminClient()
  const { data: ch } = await db.from('youtube_channels')
    .select('id, label, refresh_token, stream_id, ingest_url, stream_key').eq('id', channelId).single()
  if (!ch?.refresh_token || !ch.stream_id) {
    return NextResponse.json({ ok: false, reason: 'channel-missing' }, { status: 404 })
  }

  const { data: match } = await db.from('matches')
    .select('match_id, team_a_data:team_a(name), team_b_data:team_b(name), league:league_id(name)')
    .eq('match_id', matchId).single()
  if (!match) return NextResponse.json({ ok: false, reason: 'match-missing' }, { status: 404 })

  const a = (match as any).team_a_data?.name ?? 'Ομάδα Α'
  const b = (match as any).team_b_data?.name ?? 'Ομάδα Β'
  const league = (match as any).league?.name ?? 'Salonicup'
  const title = `${a} - ${b} | ${league}`

  try {
    const token = await ytAccessToken(ch.refresh_token)
    const broadcastId = await ytCreateBroadcast(token, ch.stream_id, {
      title, description: `${title}\n\nSalonicup`, privacy: priv as any,
    })
    const watchUrl = ytWatch(`https://www.youtube.com/watch?v=${broadcastId}`)!

    await db.from('matches').update({
      stream_url: watchUrl, yt_broadcast_id: broadcastId, yt_channel_id: ch.id,
    }).eq('match_id', matchId)

    return NextResponse.json({
      ok: true, watchUrl, broadcastId,
      ingestUrl: ch.ingest_url, streamKey: ch.stream_key,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: e?.message || 'failed' }, { status: 500 })
  }
}

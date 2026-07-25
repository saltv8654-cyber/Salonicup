import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServer, createAdminClient } from '@/lib/supabase/server'
import { ytExchangeCode, ytMyChannel, ytCreateReusableStream } from '@/lib/youtube-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Επιστροφή από Google: αποθηκεύει tokens + φτιάχνει σταθερό stream RTMP. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const admin = new URL('/admin/youtube', req.url)

  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))
  const { data: profile } = await server.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/', req.url))

  const err = url.searchParams.get('error')
  if (err) { admin.searchParams.set('err', err); return NextResponse.redirect(admin) }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const saved = cookies().get('yt_oauth_state')?.value
  if (!code || !state || !saved || state !== saved) {
    admin.searchParams.set('err', 'state'); return NextResponse.redirect(admin)
  }

  try {
    const tokens = await ytExchangeCode(url.origin, code)
    if (!tokens.refresh_token) { admin.searchParams.set('err', 'no-refresh'); return NextResponse.redirect(admin) }

    const ch = await ytMyChannel(tokens.access_token)
    const stream = await ytCreateReusableStream(tokens.access_token, 'Salonicup OBS')

    const db = createAdminClient()
    // Αν το ίδιο κανάλι ξανασυνδεθεί → ενημέρωση αντί για διπλοεγγραφή
    const row = {
      label: ch.title || 'Κανάλι YouTube',
      channel_id: ch.channelId ?? null,
      refresh_token: tokens.refresh_token,
      stream_id: stream.streamId,
      stream_key: stream.streamKey,
      ingest_url: stream.ingestUrl,
    }
    if (ch.channelId) {
      const { data: existing } = await db.from('youtube_channels').select('id').eq('channel_id', ch.channelId).maybeSingle()
      if (existing) await db.from('youtube_channels').update(row).eq('id', existing.id)
      else await db.from('youtube_channels').insert(row)
    } else {
      await db.from('youtube_channels').insert(row)
    }

    admin.searchParams.set('ok', '1')
  } catch (e: any) {
    admin.searchParams.set('err', encodeURIComponent(e?.message || 'failed'))
  }

  const res = NextResponse.redirect(admin)
  res.cookies.set('yt_oauth_state', '', { path: '/', maxAge: 0 })
  return res
}

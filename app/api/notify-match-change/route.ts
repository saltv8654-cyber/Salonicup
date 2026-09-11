import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ειδοποιεί τους αρχηγούς ΚΑΙ των δύο ομάδων ότι άλλαξε ο αγώνας τους (ώρα/γήπεδο/αναβολή). */
export async function POST(req: Request) {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pub || !priv || !service) return NextResponse.json({ ok: false, reason: 'not-configured' })

  const { match_id } = await req.json().catch(() => ({} as any))
  if (!match_id) return NextResponse.json({ ok: false }, { status: 400 })

  webpush.setVapidDetails('mailto:saltv8654@gmail.com', pub, priv)
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service, { auth: { persistSession: false } })

  const { data: m } = await admin.from('matches')
    .select('team_a, team_b, match_date, match_status, field, team_a_data:team_a(name), team_b_data:team_b(name), venue:venue_id(name)')
    .eq('match_id', match_id).maybeSingle()
  if (!m) return NextResponse.json({ ok: false }, { status: 404 })

  const fixture = `${(m.team_a_data as any)?.name ?? '?'} – ${(m.team_b_data as any)?.name ?? '?'}`
  const when = m.match_status === 'Postponed'
    ? 'αναβλήθηκε (θα οριστεί νέα ημερομηνία)'
    : m.match_date
      ? `${new Date(m.match_date).toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}${(m.venue as any)?.name || m.field ? ` · ${[(m.venue as any)?.name, m.field].filter(Boolean).join(' ')}` : ''}`
      : 'χωρίς ορισμένη ημερομηνία'

  const teamIds = [m.team_a, m.team_b].filter(Boolean) as string[]
  if (!teamIds.length) return NextResponse.json({ ok: true, sent: 0 })

  const { data: caps } = await admin.from('profiles').select('id').eq('role', 'captain').in('team_id', teamIds)
  const ids = (caps ?? []).map((c: any) => c.id)
  if (!ids.length) return NextResponse.json({ ok: true, sent: 0 })

  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', ids)
  const payload = JSON.stringify({
    title: '📅 Αλλαγή αγώνα',
    body: `${fixture}: ${when}`,
    url: '/schedule',
  })

  await Promise.all((subs ?? []).map((s: any) =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
    ).catch(async (err: any) => {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    })
  ))

  return NextResponse.json({ ok: true, sent: subs?.length ?? 0 })
}

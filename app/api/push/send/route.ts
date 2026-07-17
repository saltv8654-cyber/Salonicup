import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Μόνο speaker/admin μπορεί να στείλει
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const { data: profile } = await server
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'speaker'].includes(profile.role)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pub || !priv || !service) {
    // Δεν έχει ρυθμιστεί ακόμα — δεν σπάμε τη ροή του speaker
    return NextResponse.json({ ok: false, reason: 'not-configured' })
  }

  webpush.setVapidDetails('mailto:saltv8654@gmail.com', pub, priv)

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service, {
    auth: { persistSession: false },
  })

  const { title, body, url } = await req.json().catch(() => ({} as any))
  const payload = JSON.stringify({
    title: title || 'Salonicup',
    body: body || '',
    url: url || '/',
  })

  const { data: subs } = await admin.from('push_subscriptions').select('*')

  await Promise.all((subs ?? []).map((s: any) =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload
    ).catch(async (err: any) => {
      // Ξεπερασμένη συνδρομή → καθάρισέ την
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    })
  ))

  return NextResponse.json({ ok: true, sent: subs?.length ?? 0 })
}

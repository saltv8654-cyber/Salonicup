import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY

  const missing: string[] = []
  if (!pub) missing.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  if (!priv) missing.push('VAPID_PRIVATE_KEY')
  if (!service) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) return NextResponse.json({ ok: false, reason: 'env-missing', missing })

  webpush.setVapidDetails('mailto:saltv8654@gmail.com', pub!, priv!)

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service!, {
    auth: { persistSession: false },
  })

  const { data: subs, error } = await admin.from('push_subscriptions').select('*')
  if (error) return NextResponse.json({ ok: false, reason: 'db-error', error: error.message })
  if (!subs?.length) return NextResponse.json({ ok: false, reason: 'no-subscriptions' })

  const payload = JSON.stringify({
    title: '✅ Δοκιμή Salonicup',
    body: 'Οι ειδοποιήσεις δουλεύουν! ⚽',
    url: '/',
  })

  let sent = 0, failed = 0
  await Promise.all(subs.map((s: any) =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload
    ).then(() => { sent++ }).catch(async (e: any) => {
      failed++
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    })
  ))

  return NextResponse.json({ ok: true, subs: subs.length, sent, failed })
}

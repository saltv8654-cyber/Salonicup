import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ειδοποιεί τους admin (push) ότι έγινε νέα εγγραφή. Καλείται από τον νέο χρήστη. */
export async function POST(req: Request) {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pub || !priv || !service) return NextResponse.json({ ok: false, reason: 'not-configured' })

  webpush.setVapidDetails('mailto:saltv8654@gmail.com', pub, priv)
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service, {
    auth: { persistSession: false },
  })

  const { name, email } = await req.json().catch(() => ({} as any))

  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
  const ids = (admins ?? []).map((a: any) => a.id)
  if (!ids.length) return NextResponse.json({ ok: true, sent: 0 })

  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', ids)
  const who = (name && name.trim()) || email || 'Νέος χρήστης'
  const payload = JSON.stringify({
    title: '👤 Νέα εγγραφή',
    body: `${who} έκανε εγγραφή στο Salonicup`,
    url: '/admin/users',
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

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

  const { title, body, url, type, leagueId } = await req.json().catch(() => ({} as any))
  const payload = JSON.stringify({
    title: title || 'Salonicup',
    body: body || '',
    url: url || '/',
  })

  const { data: allSubs } = await admin.from('push_subscriptions').select('*')

  // Φιλτράρισμα βάσει προτιμήσεων της κάθε συσκευής
  const typeCol: Record<string, string> = {
    goal: 'notify_goal', start: 'notify_start', red: 'notify_red', final: 'notify_final',
  }
  const col = type ? typeCol[type] : undefined
  const subs = (allSubs ?? []).filter((s: any) => {
    // Τύπος ειδοποίησης: true αν η στήλη λείπει (προεπιλογή) ή είναι true
    if (col && s[col] === false) return false
    // Πρωτάθλημα: αν έχει οριστεί λίστα και δεν περιλαμβάνει το leagueId, παράλειψε
    if (leagueId && Array.isArray(s.league_ids) && s.league_ids.length > 0
        && !s.league_ids.includes(leagueId)) return false
    return true
  })

  await Promise.all(subs.map((s: any) =>
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

  return NextResponse.json({ ok: true, sent: subs.length })
}

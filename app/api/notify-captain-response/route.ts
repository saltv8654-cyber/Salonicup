import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LBL: Record<string, string> = { reschedule: 'ζητά αλλαγή ώρας', postpone: 'ζητά αναβολή' }

/** Ειδοποιεί τους admin (push) ότι captain ζήτησε αλλαγή/αναβολή σε αγώνα. */
export async function POST(req: Request) {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pub || !priv || !service) return NextResponse.json({ ok: false, reason: 'not-configured' })

  const { match_id, status, note } = await req.json().catch(() => ({} as any))
  if (!match_id || !LBL[status]) return NextResponse.json({ ok: false }, { status: 400 })

  webpush.setVapidDetails('mailto:saltv8654@gmail.com', pub, priv)
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service, {
    auth: { persistSession: false },
  })

  // Ποια ομάδα (του χρήστη) + λεπτομέρειες αγώνα
  const { data: prof } = await admin.from('profiles').select('team_id, full_name').eq('id', user.id).maybeSingle()
  const { data: m } = await admin.from('matches')
    .select('match_date, team_a, team_b, team_a_data:team_a(name), team_b_data:team_b(name), league:league_id(name)')
    .eq('match_id', match_id).maybeSingle()

  const fixture = (() => {
    const a = (m?.team_a_data as any)?.name, b = (m?.team_b_data as any)?.name
    return `${a ?? '?'} – ${b ?? '?'}`
  })()
  const who = (prof?.full_name || 'Captain')

  // Παραλήπτες: admins (→ /admin/matches) + ο αρχηγός της ΑΝΤΙΠΑΛΗΣ ομάδας (→ /schedule)
  const myTeam = prof?.team_id ?? null
  const oppTeam = m ? (myTeam === m.team_a ? m.team_b : myTeam === m.team_b ? m.team_a : null) : null

  const [{ data: admins }, { data: opps }] = await Promise.all([
    admin.from('profiles').select('id').eq('role', 'admin'),
    oppTeam ? admin.from('profiles').select('id').eq('role', 'captain').eq('team_id', oppTeam)
            : Promise.resolve({ data: [] as any[] }),
  ])
  const adminIds = (admins ?? []).map((a: any) => a.id)
  const oppIds   = (opps ?? []).map((a: any) => a.id)

  const title = status === 'postpone' ? '⛔ Αίτημα αναβολής' : '🕐 Αίτημα αλλαγής ώρας'
  const body  = `${who} ${LBL[status]}: ${fixture}${note ? ` — «${note}»` : ''}`

  async function push(userIds: string[], url: string) {
    if (!userIds.length) return 0
    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds)
    await Promise.all((subs ?? []).map((s: any) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url }),
      ).catch(async (err: any) => {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      })
    ))
    return subs?.length ?? 0
  }

  const [sentAdmin, sentOpp] = await Promise.all([
    push(adminIds, '/admin/matches'),
    push(oppIds, '/schedule'),
  ])

  return NextResponse.json({ ok: true, sentAdmin, sentOpp })
}

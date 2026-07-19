import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELDS = ['notify_goal', 'notify_start', 'notify_red', 'notify_final'] as const

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.endpoint) {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, key,
    { auth: { persistSession: false } }
  )

  // Αποθήκευση προτιμήσεων
  if (body.prefs) {
    const p = body.prefs
    const update: Record<string, any> = {}
    for (const f of FIELDS) if (typeof p[f] === 'boolean') update[f] = p[f]
    if (Array.isArray(p.league_ids)) update.league_ids = p.league_ids
    if (Object.keys(update).length) {
      const { error } = await supabase
        .from('push_subscriptions').update(update).eq('endpoint', body.endpoint)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  // Επιστροφή τρέχουσας κατάστασης
  const { data } = await supabase
    .from('push_subscriptions')
    .select('notify_goal, notify_start, notify_red, notify_final, league_ids')
    .eq('endpoint', body.endpoint)
    .maybeSingle()

  return NextResponse.json({ ok: true, prefs: data ?? null })
}

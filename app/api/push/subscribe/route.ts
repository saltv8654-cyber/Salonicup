import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.endpoint || !body?.p256dh || !body?.auth) {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
  }

  // Ποιος χρήστης είναι συνδεδεμένος (για στόχευση π.χ. ειδοποιήσεων admin)
  let userId: string | null = null
  try {
    const { data: { user } } = await createServer().auth.getUser()
    userId = user?.id ?? null
  } catch { /* ανώνυμος */ }

  // Προτίμησε το service role (παρακάμπτει RLS)· αλλιώς anon.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } }
  )

  // onConflict χωρίς ignoreDuplicates ώστε να ενημερώνεται το user_id σε επανεγγραφή
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth, user_id: userId },
    { onConflict: 'endpoint' }
  )

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

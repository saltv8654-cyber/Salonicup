import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ο admin ορίζει απευθείας νέο κωδικό σε χρήστη (χωρίς email reset). */
export async function POST(req: Request) {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: prof } = await server.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (prof?.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 })

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!service) return NextResponse.json({ ok: false, reason: 'not-configured' })

  const { userId, password } = await req.json().catch(() => ({} as any))
  if (!userId || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ ok: false, error: 'Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες' }, { status: 400 })
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service, {
    auth: { persistSession: false },
  })
  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

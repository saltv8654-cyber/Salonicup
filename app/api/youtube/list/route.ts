import { NextResponse } from 'next/server'
import { createClient as createServer, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ελαφριά λίστα καναλιών (id + όνομα) για τον επιλογέα του speaker. */
export async function GET() {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const { data: profile } = await server.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'speaker'].includes(profile.role)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
  const db = createAdminClient()
  const { data } = await db.from('youtube_channels')
    .select('id, label').order('created_at', { ascending: true })
  return NextResponse.json({ ok: true, channels: data ?? [] })
}

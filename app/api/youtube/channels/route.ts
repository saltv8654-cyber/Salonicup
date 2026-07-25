import { NextResponse } from 'next/server'
import { createClient as createServer, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return null
  const { data: profile } = await server.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

/** Λίστα συνδεδεμένων καναλιών (χωρίς το refresh token). */
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ ok: false }, { status: 403 })
  const db = createAdminClient()
  const { data } = await db.from('youtube_channels')
    .select('id, label, channel_id, ingest_url, stream_key, created_at')
    .order('created_at', { ascending: true })
  return NextResponse.json({ ok: true, channels: data ?? [] })
}

/** Αποσύνδεση καναλιού. */
export async function DELETE(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ ok: false }, { status: 403 })
  const { id } = await req.json().catch(() => ({} as any))
  if (!id) return NextResponse.json({ ok: false }, { status: 400 })
  const db = createAdminClient()
  await db.from('youtube_channels').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

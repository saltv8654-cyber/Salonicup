import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient as createServer } from '@/lib/supabase/server'
import { ytConfigured, ytConsentUrl } from '@/lib/youtube-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ξεκινά τη σύνδεση καναλιού YouTube (μόνο admin). */
export async function GET(req: Request) {
  const server = createServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))
  const { data: profile } = await server.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/', req.url))

  if (!ytConfigured()) {
    return NextResponse.redirect(new URL('/admin/youtube?err=not-configured', req.url))
  }

  const origin = new URL(req.url).origin
  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(ytConsentUrl(origin, state))
  res.cookies.set('yt_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  })
  return res
}

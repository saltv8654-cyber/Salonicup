import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Επιστρέφει ΜΟΝΟ αν είναι ρυθμισμένο το AI (boolean) — ποτέ το ίδιο το κλειδί. */
export function GET() {
  const key = process.env.ANTHROPIC_API_KEY || ''
  return NextResponse.json({
    enabled: !!key,
    model: key ? 'claude-opus-5' : null,
    keyHint: key ? `${key.slice(0, 7)}…(${key.length})` : null, // π.χ. "sk-ant-…(108)" για επιβεβαίωση, χωρίς να εκτίθεται
  }, { headers: { 'Cache-Control': 'no-store' } })
}

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/** Δημιουργεί speaker/admin. Μόνο για admin. */
export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })

    const { data: me } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') {
      return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
    }

    const { email, password, full_name, role } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Λείπει email ή κωδικός' }, { status: 400 })
    }
    if (!['admin', 'speaker', 'captain', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Άκυρος ρόλος' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? '', role },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Ο trigger φτιάχνει το profile· εξασφαλίζουμε τον ρόλο
    await admin.from('profiles')
      .update({ role, full_name: full_name ?? '' })
      .eq('id', data.user.id)

    return NextResponse.json({ ok: true, id: data.user.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Σφάλμα' }, { status: 500 })
  }
}

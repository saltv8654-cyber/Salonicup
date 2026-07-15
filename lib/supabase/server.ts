import { createServerClient } from '@supabase/ssr'
import { createClient as createRaw } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function createClient() {
  const store = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options?: any }[]) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Server Component — τα cookies τα γράφει το middleware
          }
        },
      },
    }
  )
}

/** Παρακάμπτει RLS. Μόνο σε API routes, ποτέ στον client. */
export function createAdminClient() {
  return createRaw(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

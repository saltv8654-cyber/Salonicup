import { createClient } from '@supabase/supabase-js'

/* Χρώματα (ίδια παλέτα με το app) */
export const C = {
  bg: '#0B0B0E',
  turf: '#16161B',
  card: '#1C1C22',
  brand: '#E05B1F',
  lit: '#F5782E',
  chalk: '#EDEDF0',
  silver: '#B8B8C0',
  dim: '#63636E',
  line: 'rgba(237,237,240,0.08)',
}

/** Public (anon) client — μόνο ανάγνωση δημόσιων δεδομένων. */
export function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Γραμματοσειρά με ελληνικά (DejaVu Sans) από τα public assets (όχι στο bundle). */
export async function loadFonts(origin: string) {
  const [regular, bold] = await Promise.all([
    fetch(`${origin}/fonts/DejaVuSans.ttf`).then((r) => r.arrayBuffer()),
    fetch(`${origin}/fonts/DejaVuSans-Bold.ttf`).then((r) => r.arrayBuffer()),
  ])
  return [
    { name: 'Deja', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Deja', data: bold, weight: 700 as const, style: 'normal' as const },
  ]
}

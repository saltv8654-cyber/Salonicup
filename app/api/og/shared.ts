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

/** Γραμματοσειρά με ελληνικά (DejaVu Sans), bundled δίπλα στα routes. */
export async function loadFonts() {
  const [regular, bold] = await Promise.all([
    fetch(new URL('./_fonts/DejaVuSans.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./_fonts/DejaVuSans-Bold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
  ])
  return [
    { name: 'Deja', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Deja', data: bold, weight: 700 as const, style: 'normal' as const },
  ]
}

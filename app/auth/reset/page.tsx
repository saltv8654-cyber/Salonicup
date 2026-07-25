'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Watermark } from '@/app/ui'
import toast from 'react-hot-toast'

export default function ResetPage() {
  const supabase = createClient()
  const router = useRouter()
  const [pass, setPass]   = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy]   = useState(false)
  const [ready, setReady] = useState(false)
  const [err, setErr]     = useState('')

  // Ο σύνδεσμος από το email δημιουργεί προσωρινή συνεδρία (recovery).
  // Καλύπτουμε όλες τις μορφές που στέλνει το Supabase:
  //  • ?token_hash=…&type=recovery  → verifyOtp (δουλεύει και σε άλλη συσκευή)
  //  • ?code=…                      → αυτόματη ανταλλαγή από τον client
  //  • #access_token=…              → αυτόματη ανίχνευση από τον client
  useEffect(() => {
    let done = false
    const url = new URL(window.location.href)
    const token_hash = url.searchParams.get('token_hash')
    const type = url.searchParams.get('type')
    const linkErr = url.searchParams.get('error_description') || url.hash.includes('error')

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) { done = true; setReady(true); setErr('') }
    })

    ;(async () => {
      if (linkErr) { setErr('Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί. Ζήτησε νέο email.'); return }
      if (token_hash && (type === 'recovery' || !type)) {
        const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash })
        if (error) { setErr('Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί. Ζήτησε νέο email.'); return }
        done = true; setReady(true); return
      }
      const { data } = await supabase.auth.getSession()
      if (data.session) { done = true; setReady(true) }
    })()

    // Αν μετά από λίγο δεν έχει «πιάσει» ο σύνδεσμος, δείξε καθαρό μήνυμα
    const t = setTimeout(async () => {
      if (done) return
      const { data } = await supabase.auth.getSession()
      if (!data.session) setErr('Ο σύνδεσμος δεν αναγνωρίστηκε. Άνοιξέ τον στον ίδιο browser που ζήτησες την επαναφορά, ή ζήτησε νέο email.')
    }, 6000)

    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pass.length < 6) { toast.error('Τουλάχιστον 6 χαρακτήρες'); return }
    if (pass !== pass2) { toast.error('Οι κωδικοί δεν ταιριάζουν'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) {
      toast.error('Δεν άλλαξε ο κωδικός — άνοιξε ξανά τον σύνδεσμο από το email')
      return
    }
    toast.success('Ο κωδικός άλλαξε! Συνδέσου.')
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-pitch flex flex-col justify-center px-6 relative overflow-hidden">
      <div className="absolute -right-16 -top-10 w-72 h-80">
        <Watermark opacity={0.04} />
      </div>

      <div className="relative w-full max-w-sm mx-auto">
        <div className="mb-8">
          <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
            Salonicup
          </p>
          <h1 className="text-[26px] font-extrabold text-chalk mt-1.5 tracking-tight">
            Νέος κωδικός
          </h1>
          <p className={`text-[13px] mt-1.5 ${err ? 'text-red-400' : 'text-dim'}`}>
            {err
              ? err
              : ready
                ? 'Γράψε τον νέο σου κωδικό.'
                : 'Άνοιξε αυτή τη σελίδα από τον σύνδεσμο που σου ήρθε στο email…'}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[8.5px] font-extrabold text-dim
              tracking-[0.12em] mb-1.5 pl-0.5">ΝΕΟΣ ΚΩΔΙΚΟΣ</label>
            <input
              type="password" value={pass} required
              onChange={e => setPass(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-turf rounded-xl px-4 py-3.5 text-chalk text-sm
                outline-none border border-chalk/[0.07] focus:border-lit/50"
            />
          </div>
          <div>
            <label className="block text-[8.5px] font-extrabold text-dim
              tracking-[0.12em] mb-1.5 pl-0.5">ΕΠΑΝΑΛΗΨΗ</label>
            <input
              type="password" value={pass2} required
              onChange={e => setPass2(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-turf rounded-xl px-4 py-3.5 text-chalk text-sm
                outline-none border border-chalk/[0.07] focus:border-lit/50"
            />
          </div>

          <button type="submit" disabled={busy || !ready}
            className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
              text-white font-extrabold text-[15px] mt-2 disabled:opacity-50
              shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
            {busy ? 'Αποθήκευση…' : ready ? 'Αλλαγή κωδικού' : 'Άνοιξε από το email…'}
          </button>
        </form>

        <button onClick={() => router.push('/auth/login')}
          className="w-full py-3 mt-3 text-dim font-semibold text-[12.5px]">
          ← Πίσω στη σύνδεση
        </button>
      </div>
    </div>
  )
}

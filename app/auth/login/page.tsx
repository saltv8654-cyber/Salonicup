'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { Watermark } from '@/app/ui'
import toast from 'react-hot-toast'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [busy, setBusy]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await signIn(email, pass)
      router.push(params.get('next') ?? '/speaker')
      router.refresh()
    } catch (err: any) {
      toast.error('Λάθος email ή κωδικός')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-pitch flex flex-col justify-center px-6 relative
      overflow-hidden">
      <div className="absolute -right-16 -top-10 w-72 h-80">
        <Watermark opacity={0.04} />
      </div>

      <div className="relative w-full max-w-sm mx-auto">
        <div className="mb-8">
          <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">
            Salonicup
          </p>
          <h1 className="text-[26px] font-extrabold text-chalk mt-1.5 tracking-tight">
            Σύνδεση
          </h1>
          <p className="text-[13px] text-dim mt-1.5">
            Για speakers και διαχειριστές
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[8.5px] font-extrabold text-dim
              tracking-[0.12em] mb-1.5 pl-0.5">EMAIL</label>
            <input
              type="email" value={email} required
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full bg-turf rounded-xl px-4 py-3.5 text-chalk text-sm
                outline-none border border-chalk/[0.07] focus:border-lit/50"
            />
          </div>

          <div>
            <label className="block text-[8.5px] font-extrabold text-dim
              tracking-[0.12em] mb-1.5 pl-0.5">ΚΩΔΙΚΟΣ</label>
            <input
              type="password" value={pass} required
              onChange={e => setPass(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-turf rounded-xl px-4 py-3.5 text-chalk text-sm
                outline-none border border-chalk/[0.07] focus:border-lit/50"
            />
          </div>

          <button type="submit" disabled={busy}
            className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
              text-white font-extrabold text-[15px] mt-2 disabled:opacity-50
              shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
            {busy ? 'Σύνδεση…' : 'Σύνδεση'}
          </button>
        </form>

        <button onClick={() => router.push('/')}
          className="w-full py-3 mt-3 text-dim font-semibold text-[12.5px]">
          ← Πίσω στα πρωταθλήματα
        </button>
      </div>
    </div>
  )
}

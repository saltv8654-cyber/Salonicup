'use client'

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied'

export function pushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

export function pushState(): PushState {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushState
}

/** Ζητά άδεια, εγγράφεται στο push και στέλνει τη συνδρομή στον server. */
export async function enablePush() {
  if (!pushSupported()) throw new Error('Δεν υποστηρίζεται σε αυτή τη συσκευή')
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) throw new Error('Λείπει το VAPID key')

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Δεν δόθηκε άδεια')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(key),
    })
  }
  const j = sub.toJSON() as any
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }),
  })
  if (!res.ok) {
    const info = await res.json().catch(() => null)
    throw new Error('Εγγραφή: ' + (info?.error || `HTTP ${res.status}`))
  }
}

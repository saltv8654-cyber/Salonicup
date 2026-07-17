/* Salonicup service worker — installability + offline shell.
   Προσοχή: τα live δεδομένα (Supabase, API) ΔΕΝ γίνονται cache. */
const CACHE = 'salonicup-v2'
const ASSETS = [
  '/', '/manifest.json',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Άσε τρίτα hosts (Supabase κ.λπ.) να πάνε κατευθείαν στο δίκτυο
  if (url.origin !== self.location.origin) return

  // Hashed static assets → cache-first
  if (url.pathname.startsWith('/_next/static') ||
      /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
          return res
        })
      )
    )
    return
  }

  // Πλοήγηση/σελίδες → network-first, fallback σε cache/offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((c) => c || caches.match('/'))
      )
    )
  }
})

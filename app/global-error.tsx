'use client'

import { useEffect } from 'react'

/** Σφάλμα φόρτωσης chunk μετά από νέο deploy (τα hashes άλλαξαν → 404). */
function isChunkError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null
  const s = `${e?.name ?? ''} ${e?.message ?? ''}`
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(s)
}

export default function GlobalError({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const chunk = isChunkError(error)

  useEffect(() => {
    if (!chunk) return
    const KEY = '__chunk_reload_at'
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 20000) return
    sessionStorage.setItem(KEY, String(Date.now()))
    ;(async () => {
      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
      } catch { /* αγνόησε */ }
      window.location.reload()
    })()
  }, [chunk])

  return (
    <html lang="el">
      <body style={{ padding: 20, background: '#0B0B0E', color: '#EDEDF0',
        fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }}>
        {chunk ? (
          <div style={{ minHeight: '80vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 34, marginBottom: 12 }}>⚽</div>
              <h1 style={{ fontSize: 18, fontWeight: 800 }}>Νέα έκδοση</h1>
              <p style={{ fontSize: 13, marginTop: 8, color: '#A3A3AD' }}>Ανανέωση…</p>
              <button onClick={() => window.location.reload()} style={{ marginTop: 18, padding: '10px 18px',
                borderRadius: 10, background: '#E05B1F', color: '#fff', fontWeight: 800, border: 'none' }}>
                Ανανέωση τώρα
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 800 }}>Κάτι πήγε στραβά</h1>
            <p style={{ fontSize: 13, marginTop: 10, whiteSpace: 'pre-wrap', color: '#ff9a9a' }}>
              {error?.message || String(error)}
            </p>
            {error?.digest && (
              <p style={{ fontSize: 11, marginTop: 6, color: '#8892A6' }}>digest: {error.digest}</p>
            )}
            <pre style={{ fontSize: 10, marginTop: 12, whiteSpace: 'pre-wrap', color: '#8892A6',
              maxHeight: 320, overflow: 'auto' }}>{error?.stack}</pre>
            <button onClick={reset} style={{ marginTop: 16, padding: '10px 18px', borderRadius: 10,
              background: '#E05B1F', color: '#fff', fontWeight: 800, border: 'none' }}>
              Δοκίμασε ξανά
            </button>
          </>
        )}
      </body>
    </html>
  )
}

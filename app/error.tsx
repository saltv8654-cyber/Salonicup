'use client'

export default function Error({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: 20, minHeight: '100vh', background: '#0B0B0E', color: '#EDEDF0',
      fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }}>
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
    </div>
  )
}

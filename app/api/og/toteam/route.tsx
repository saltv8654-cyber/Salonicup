import { ImageResponse } from 'next/og'
import { dbAdmin, loadFonts, C } from '../shared'
import { slotCoords } from '@/lib/formations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// «Ομάδα της αγωνιστικής» — εικόνα έτοιμη για Instagram (1080×1350).
// ?ids=uuid1,uuid2,...  (σειρά = θέσεις της διάταξης, index 0 = τερματοφύλακας)
// &formation=3-3-1  &title=...  &sub=...  &accent=%23E05B1F

function shortName(n?: string) {
  if (!n) return ''
  const parts = n.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : n
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const url = new URL(req.url)
  const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim())  // κρατά κενές θέσεις για σωστή στοίχιση
  const idsQuery = ids.filter(Boolean)
  const formation = url.searchParams.get('formation') || '3-3-1'
  const league = url.searchParams.get('league') || ''
  const title = url.searchParams.get('title') || 'TEAM OF THE WEEK'
  const sub = url.searchParams.get('sub') || ''
  const accent = url.searchParams.get('accent') || C.brand

  try {
    const supabase = dbAdmin()
    const { data } = idsQuery.length
      ? await supabase.from('players').select('player_id, full_name, number, photo_url').in('player_id', idsQuery)
      : { data: [] as any[] }
    const byId: Record<string, any> = {}
    ;(data ?? []).forEach((p: any) => { byId[p.player_id] = p })

    const coords = slotCoords(formation)
    const PW = 1000, PH = 1050, PLEFT = 40, PTOP = 262
    const NODE = 160

    const fonts = await loadFonts(origin)

    const res = new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: `linear-gradient(160deg, ${C.bg}, #05100a)`, fontFamily: 'Deja', color: C.chalk }}>
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '42px 48px 0' }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 7, color: C.silver }}>
              SALONICUP
            </div>
            {league ? (
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, letterSpacing: 1, color: accent, marginTop: 2 }}>
                {league.toUpperCase()}</div>
            ) : null}
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, marginTop: 2, lineHeight: 1.02 }}>{title}</div>
            {sub ? <div style={{ display: 'flex', fontSize: 30, color: C.silver, marginTop: 6 }}>{sub}</div> : null}
          </div>

          {/* Γήπεδο */}
          <div style={{ position: 'absolute', left: PLEFT, top: PTOP, width: PW, height: PH,
            display: 'flex', borderRadius: 28,
            background: 'linear-gradient(180deg, #1f5130, #12351f 60%, #0e2b19)',
            border: '2px solid rgba(255,255,255,0.14)' }}>
            {/* Γραμμές */}
            <div style={{ position: 'absolute', left: 24, top: PH / 2 - 1, width: PW - 48, height: 2, display: 'flex',
              background: 'rgba(255,255,255,0.16)' }} />
            <div style={{ position: 'absolute', left: PW / 2 - 90, top: PH / 2 - 90, width: 180, height: 180,
              display: 'flex', borderRadius: 90, border: '2px solid rgba(255,255,255,0.16)' }} />

            {coords.map((c, i) => {
              const p = byId[ids[i]]
              const left = c.x * PW - NODE / 2
              const top = c.y * PH - 96
              return (
                <div key={i} style={{ position: 'absolute', left, top, width: NODE, display: 'flex',
                  flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ position: 'relative', display: 'flex' }}>
                    <div style={{ width: 132, height: 132, borderRadius: 66, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      border: '5px solid #ffffff', background: accent }}>
                      {p?.photo_url
                        ? <img src={p.photo_url} width={132} height={132} style={{ width: 132, height: 132, objectFit: 'cover' }} />
                        : <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, color: '#fff' }}>
                            {p?.number != null ? String(p.number) : (p?.full_name?.[0] ?? '?')}</div>}
                    </div>
                    {p?.photo_url && p?.number != null && (
                      <div style={{ position: 'absolute', bottom: -6, right: -6, minWidth: 44, height: 44,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 22,
                        background: '#0b0b0e', color: '#fff', fontSize: 24, fontWeight: 700, border: '4px solid #fff' }}>
                        {String(p.number)}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', marginTop: 12, background: 'rgba(0,0,0,0.62)', borderRadius: 10,
                    padding: '7px 14px', color: '#fff', fontSize: 26, fontWeight: 700, maxWidth: NODE + 40 }}>
                    {shortName(p?.full_name) || '—'}</div>
                </div>
              )
            })}
          </div>
        </div>
      ),
      { width: 1080, height: 1350, fonts }
    )
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return res
  } catch (e: any) {
    return new Response('og error: ' + (e?.message || String(e)), { status: 500 })
  }
}

import { ImageResponse } from 'next/og'
import { dbAdmin, loadFonts, C } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TZ = 'Europe/Athens'
const WD = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ']
const REF = '#F2C230'
const LGC = ['#e0563c', '#2FA84F', '#3a86ff', '#F2C230', '#e0176b', '#8a6dff', '#20c4b8', '#ff7a2f']

function keyOf(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}
function hhmm(iso: string) {
  return new Intl.DateTimeFormat('el-GR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}
function dayLabel(key: string) {
  const d = new Date(`${key}T12:00:00Z`)
  const [, m, dd] = key.split('-')
  return `${WD[d.getUTCDay()]} ${parseInt(dd)}/${parseInt(m)}`
}
function thisMonday() {
  const now = new Date()
  const wd = (now.getUTCDay() + 6) % 7
  now.setUTCDate(now.getUTCDate() - wd)
  return now.toISOString().slice(0, 10)
}
function lgColor(n: string) {
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return LGC[h % LGC.length]
}
/** Μαύρο ή λευκό κείμενο ανάλογα με τη φωτεινότητα του χρώματος. */
function txtOn(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0B0B0E' : '#ffffff'
}

export async function GET(req: Request) {
 try {
  const url = new URL(req.url)
  const origin = url.origin
  const start = url.searchParams.get('start') || thisMonday()
  const startD = new Date(`${start}T00:00:00Z`)
  const endD = new Date(startD.getTime() + 7 * 86400000)
  const endKey = endD.toISOString().slice(0, 10)

  const supabase = dbAdmin()
  const [{ data: matches }, { data: profs }, { data: staff }] = await Promise.all([
    supabase.from('matches')
      .select('match_id, match_date, field, speaker_id, referee_id, team_a_data:team_a(name), team_b_data:team_b(name), league:league_id(name)')
      .gte('match_date', startD.toISOString()).lt('match_date', endD.toISOString())
      .order('match_date', { ascending: true }),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('staff').select('id, name'),
  ])
  const nameOf = (id: string | null, list: any[], key: string) =>
    (id && (list ?? []).find((x: any) => x.id === id)?.[key]) || null
  const spk = (id: string | null) => nameOf(id, profs ?? [], 'full_name')
  const ref = (id: string | null) => nameOf(id, staff ?? [], 'name')

  const byDay = new Map<string, any[]>()
  for (const m of matches ?? []) {
    if (!m.match_date) continue
    const k = keyOf(m.match_date)
    if (k < start || k >= endKey) continue
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(m)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const total = (matches ?? []).length

  const fonts = await loadFonts(origin)

  // Γεωμετρία πίνακα (πολύ φαρδύ landscape, ώστε να χωράνε άνετα τα ονόματα)
  const W = 1760, P = 56
  const HEADER = 176, COLHEAD = 60, DAY_H = 62, ROW_H = 62
  let H = P * 2 + HEADER + COLHEAD + 24
  for (const [, ms] of days) H += DAY_H + ms.length * ROW_H
  if (!days.length) H = 680

  // Στήλες (πλάτη)
  const wTime = 112, wLeague = 176, wField = 70, wSpk = 262, wRef = 262

  const rangeLabel = `${dayLabel(start).replace(/^\S+\s/, '')} – ${dayLabel(new Date(endD.getTime() - 86400000).toISOString().slice(0, 10)).replace(/^\S+\s/, '')}`

  const Cell = ({ w, children, color = C.chalk, size = 25, bold = false, center = false, dot }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', width: w, flex: w ? undefined : 1, minWidth: 0,
      justifyContent: center ? 'center' : 'flex-start', overflow: 'hidden' }}>
      {dot ? <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: dot, marginRight: 8, flexShrink: 0 }} /> : null}
      <div style={{ display: 'flex', fontSize: size, color, fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', paddingRight: 12 }}>
        {children}
      </div>
    </div>
  )

  const res = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: 'Deja', color: C.chalk, padding: P }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: 8, color: C.lit }}>
            SALONICUP · ΠΡΟΓΡΑΜΜΑ
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 700 }}>Πρόγραμμα εβδομάδας</div>
            <div style={{ display: 'flex', fontSize: 36, color: C.silver }}>{rangeLabel}</div>
          </div>
          <div style={{ display: 'flex', marginTop: 10, fontSize: 24, color: C.dim }}>{total} αγώνες</div>
        </div>

        {!days.length ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', fontSize: 34, color: C.dim }}>
            Δεν υπάρχουν αγώνες αυτή την εβδομάδα.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
            {/* Επικεφαλίδες στηλών */}
            <div style={{ display: 'flex', alignItems: 'center', height: COLHEAD, paddingLeft: 16, paddingRight: 16,
              borderBottom: `2px solid ${C.line}`, color: C.dim, fontSize: 24, fontWeight: 700 }}>
              <div style={{ display: 'flex', width: 8, marginRight: 14, flexShrink: 0 }} />
              <Cell w={wTime} color={C.dim} size={24} bold>ΩΡΑ</Cell>
              <Cell color={C.dim} size={24} bold>ΑΓΩΝΑΣ</Cell>
              <Cell w={wLeague} color={C.dim} size={24} bold>ΔΙΟΡΓ.</Cell>
              <Cell w={wField} color={C.dim} size={24} bold center>ΓΗΠ</Cell>
              <Cell w={wSpk} color={C.lit} size={24} bold>ΣΠΙΚΕΡ</Cell>
              <Cell w={wRef} color={REF} size={24} bold>ΔΙΑΙΤΗΤΗΣ</Cell>
            </div>

            {days.map(([key, ms]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Ημέρα */}
                <div style={{ display: 'flex', alignItems: 'center', height: DAY_H, paddingLeft: 16,
                  background: 'rgba(224,91,31,0.16)', marginTop: 12, borderRadius: 9,
                  fontSize: 32, fontWeight: 700, color: C.lit, letterSpacing: 1 }}>
                  {dayLabel(key)}
                  <div style={{ display: 'flex', fontSize: 24, color: C.dim, marginLeft: 16 }}>· {ms.length}</div>
                </div>
                {/* Γραμμές αγώνων */}
                {ms.map((m: any, i: number) => {
                  const lg = m.league?.name ?? ''
                  const lc = lgColor(lg)
                  return (
                  <div key={m.match_id} style={{ display: 'flex', alignItems: 'center', height: ROW_H,
                    paddingLeft: 16, paddingRight: 16, background: i % 2 ? 'transparent' : C.turf, borderRadius: 7 }}>
                    <div style={{ display: 'flex', width: 8, height: 40, borderRadius: 4, background: lc, marginRight: 14, flexShrink: 0 }} />
                    <Cell w={wTime} size={31} bold>{hhmm(m.match_date)}</Cell>
                    <Cell size={31} bold>{m.team_a_data?.name} – {m.team_b_data?.name}</Cell>
                    <div style={{ display: 'flex', width: wLeague, flexShrink: 0, alignItems: 'center', overflow: 'hidden', paddingRight: 12 }}>
                      <div style={{ display: 'flex', background: lc, color: txtOn(lc), fontSize: 22, fontWeight: 700,
                        padding: '4px 14px', borderRadius: 8, whiteSpace: 'nowrap', overflow: 'hidden' }}>{lg}</div>
                    </div>
                    <Cell w={wField} size={27} center color={C.silver}>{(m.field ?? '').toString().replace(/[^0-9]/g, '') || '—'}</Cell>
                    <Cell w={wSpk} size={27} bold color={spk(m.speaker_id) ? C.chalk : C.dim}>{spk(m.speaker_id) || '—'}</Cell>
                    <Cell w={wRef} size={27} bold color={ref(m.referee_id) ? C.chalk : C.dim}>{ref(m.referee_id) || '—'}</Cell>
                  </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { width: W, height: H, fonts },
  )
  // Χωρίς cache, ώστε αλλαγές να φαίνονται αμέσως
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  return res
 } catch (e: any) {
  return new Response('OG program error:\n' + (e?.stack || e?.message || String(e)), {
    status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
 }
}

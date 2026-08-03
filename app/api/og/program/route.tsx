import { ImageResponse } from 'next/og'
import { dbAdmin, loadFonts, C } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TZ = 'Europe/Athens'
const WD = ['ΚΥΡΙΑΚΗ', 'ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ']
const REF = '#F2C230'

function keyOf(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}
function hhmm(iso: string) {
  return new Intl.DateTimeFormat('el-GR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}
function dayLabel(key: string) {
  const d = new Date(`${key}T12:00:00Z`)
  const [y, m, dd] = key.split('-')
  return `${WD[d.getUTCDay()]} ${parseInt(dd)}/${parseInt(m)}`
}
/** Δευτέρα της τρέχουσας εβδομάδας (UTC fallback) σε YYYY-MM-DD. */
function thisMonday() {
  const now = new Date()
  const wd = (now.getUTCDay() + 6) % 7
  now.setUTCDate(now.getUTCDate() - wd)
  return now.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
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

  // Ομαδοποίηση ανά ημέρα (μόνο μέσα στην εβδομάδα)
  const byDay = new Map<string, any[]>()
  for (const m of matches ?? []) {
    if (!m.match_date) continue
    const k = keyOf(m.match_date)
    if (k < start || k >= endKey) continue
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(m)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const fonts = await loadFonts(origin)

  // Δυναμικό ύψος καμβά
  const W = 1080, P = 56
  const HEADER = 150, DAY_H = 62, DAY_GAP = 30, CARD = 108
  let H = P * 2 + HEADER + 20
  for (const [, ms] of days) H += DAY_GAP + DAY_H + ms.length * CARD
  if (!days.length) H = 700

  const rangeLabel = `${dayLabel(start).replace(/^\S+\s/, '')}  –  ${dayLabel(endKey <= start ? start : new Date(endD.getTime() - 86400000).toISOString().slice(0, 10)).replace(/^\S+\s/, '')}`

  const Tag = ({ dot, label, value }: { dot: string; label: string; value: string | null }) => (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: dot, marginRight: 10 }} />
      <div style={{ display: 'flex', fontSize: 22, color: C.dim, marginRight: 8 }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 24, color: value ? C.chalk : C.dim, fontWeight: 700,
        overflow: 'hidden', whiteSpace: 'nowrap' }}>{value || '—'}</div>
    </div>
  )

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: 'Deja', color: C.chalk, padding: P }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 8, color: C.lit }}>
            SALONICUP · ΠΡΟΓΡΑΜΜΑ
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 700 }}>Εβδομάδα</div>
            <div style={{ display: 'flex', fontSize: 30, color: C.silver }}>{rangeLabel}</div>
          </div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: 22, color: C.dim }}>
            <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: C.lit, marginRight: 8 }} />
            <div style={{ display: 'flex', marginRight: 22 }}>Σπίκερ</div>
            <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: REF, marginRight: 8 }} />
            <div style={{ display: 'flex' }}>Διαιτητής</div>
          </div>
        </div>

        {!days.length ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center',
            fontSize: 34, color: C.dim }}>Δεν υπάρχουν αγώνες αυτή την εβδομάδα.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
            {days.map(([key, ms]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', marginTop: DAY_GAP }}>
                {/* Ημέρα */}
                <div style={{ display: 'flex', alignItems: 'center', height: DAY_H - 14,
                  fontSize: 30, fontWeight: 700, color: C.lit, letterSpacing: 2 }}>
                  <div style={{ display: 'flex', width: 8, height: 30, borderRadius: 4, background: C.brand, marginRight: 16 }} />
                  {dayLabel(key)}
                </div>
                {/* Αγώνες */}
                {ms.map((m: any) => (
                  <div key={m.match_id} style={{ display: 'flex', flexDirection: 'column',
                    background: C.turf, borderRadius: 14, padding: '14px 20px', marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', width: 92, fontSize: 30, fontWeight: 700, color: C.chalk }}>
                        {hhmm(m.match_date)}
                      </div>
                      {m.field ? (
                        <div style={{ display: 'flex', fontSize: 20, color: '#c4b5fd', background: 'rgba(109,40,217,0.25)',
                          border: '1px solid rgba(109,40,217,0.6)', borderRadius: 8, padding: '2px 10px', marginRight: 14 }}>
                          {m.field}
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', flex: 1, fontSize: 30, fontWeight: 700, color: C.chalk,
                        overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {m.team_a_data?.name} – {m.team_b_data?.name}
                      </div>
                      <div style={{ display: 'flex', fontSize: 20, color: C.dim, marginLeft: 12 }}>
                        {m.league?.name ?? ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
                      <Tag dot={C.lit} label="ΣΠ" value={spk(m.speaker_id)} />
                      <Tag dot={REF} label="ΔΙΑΙΤ" value={ref(m.referee_id)} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { width: W, height: H, fonts },
  )
}

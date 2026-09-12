import { ImageResponse } from 'next/og'
import { dbAdmin, loadFonts, C } from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GOLD = '#E8B923', GOLD2 = '#F0D264'

type T = { id: string; name: string; logo: string | null; seed: number }
type Side = { seed?: number; name?: string; logo?: string | null; scores?: (number | null)[]; win?: boolean; ph?: string }
type Tie = { a: Side; b: Side }

export async function GET(req: Request, { params }: { params: { leagueId: string } }) {
  const url = new URL(req.url)
  const origin = url.origin
  const story = url.searchParams.get('format') === 'story'
  const supabase = dbAdmin()

  const [{ data: league }, { data: rows }, { data: pmatches }] = await Promise.all([
    supabase.from('leagues').select('name, season, logo_url').eq('league_id', params.leagueId).single(),
    supabase.from('standings').select('team_id, team_name, logo_url, position')
      .eq('league_id', params.leagueId).order('position'),
    supabase.from('matches')
      .select('team_a, team_b, goals_team_a, goals_team_b, match_status, stage, match_date')
      .eq('league_id', params.leagueId).in('stage', ['QF', 'SF', 'Final']),
  ])
  if (!rows) return new Response('Not found', { status: 404 })
  const fonts = await loadFonts(origin)

  const seeds: (T | undefined)[] = rows.slice(0, 8).map((r: any, i: number) =>
    ({ id: r.team_id, name: r.team_name, logo: r.logo_url, seed: i + 1 }))
  const side = (t: T): Side => ({ seed: t.seed, name: t.name, logo: t.logo })
  const doneM = (m: any) => ['Played', 'Forfeit'].includes(m.match_status)
  const legsOf = (s: string) => (s === 'Final' ? 1 : 2)
  const tieData = (t1: T, t2: T, stg: string) => {
    const legN = legsOf(stg)
    const ms = (pmatches ?? [])
      .filter((m: any) => m.stage === stg &&
        ((m.team_a === t1.id && m.team_b === t2.id) || (m.team_a === t2.id && m.team_b === t1.id)))
      .sort((a: any, b: any) => String(a.match_date ?? '').localeCompare(String(b.match_date ?? '')))
    const s1: (number | null)[] = [], s2: (number | null)[] = []
    for (let i = 0; i < legN; i++) {
      const m = ms[i]
      if (m && doneM(m)) {
        s1.push(m.team_a === t1.id ? m.goals_team_a : m.goals_team_b)
        s2.push(m.team_a === t1.id ? m.goals_team_b : m.goals_team_a)
      } else { s1.push(null); s2.push(null) }
    }
    const played = s1.filter(x => x != null).length
    const g1 = s1.reduce((a: number, x) => a + (x ?? 0), 0)
    const g2 = s2.reduce((a: number, x) => a + (x ?? 0), 0)
    const decided = played === legN && g1 !== g2
    return { s1, s2, winner: decided ? (g1 > g2 ? t1 : t2) : undefined }
  }
  const mkTie = (t1?: T, t2?: T, stg = 'QF', ph1 = '', ph2 = ''): { tie: Tie; winner?: T } => {
    if (!t1 || !t2) return { tie: { a: t1 ? side(t1) : { ph: ph1 }, b: t2 ? side(t2) : { ph: ph2 } } }
    const r = tieData(t1, t2, stg)
    return { winner: r.winner, tie: {
      a: { seed: t1.seed, name: t1.name, logo: t1.logo, scores: r.s1, win: r.winner?.id === t1.id },
      b: { seed: t2.seed, name: t2.name, logo: t2.logo, scores: r.s2, win: r.winner?.id === t2.id },
    } }
  }
  const t18 = mkTie(seeds[0], seeds[7], 'QF', '1ος', '8ος')
  const t45 = mkTie(seeds[3], seeds[4], 'QF', '4ος', '5ος')
  const t27 = mkTie(seeds[1], seeds[6], 'QF', '2ος', '7ος')
  const t36 = mkTie(seeds[2], seeds[5], 'QF', '3ος', '6ος')
  const sTop = mkTie(t18.winner, t45.winner, 'SF', 'Νικητής 1v8', 'Νικητής 4v5')
  const sBot = mkTie(t27.winner, t36.winner, 'SF', 'Νικητής 2v7', 'Νικητής 3v6')
  const fin  = mkTie(sTop.winner, sBot.winner, 'Final', 'Ημιτελικός 1', 'Ημιτελικός 2')
  const champ = fin.winner

  const CW = 430            // πλάτος κάρτας
  const rowH = 66

  const Row = ({ s, gold }: { s: Side; gold?: boolean }) => {
    if (s.ph) return (
      <div style={{ display: 'flex', alignItems: 'center', height: rowH, padding: '0 16px' }}>
        <div style={{ display: 'flex', width: 26 }} />
        <div style={{ display: 'flex', fontSize: 24, color: C.dim }}>{s.ph}</div>
      </div>
    )
    const scores = s.scores?.length ? s.scores : [null]
    const acc = gold ? GOLD2 : C.lit
    const nm = s.name ?? '—'
    const nameFs = nm.length > 16 ? 21 : nm.length > 12 ? 24 : 27
    return (
      <div style={{ display: 'flex', alignItems: 'center', height: rowH, padding: '0 16px',
        background: s.win ? (gold ? 'rgba(232,185,35,0.15)' : 'rgba(245,120,46,0.16)') : 'transparent' }}>
        <div style={{ display: 'flex', width: 26, justifyContent: 'center', fontSize: 20, fontWeight: 700, color: C.dim }}>
          {s.seed ?? ''}
        </div>
        {s.logo
          ? <img src={s.logo} width={34} height={34} style={{ width: 34, height: 34, objectFit: 'contain', margin: '0 10px' }} />
          : <div style={{ display: 'flex', width: 34, height: 34, margin: '0 10px' }} />}
        <div style={{ display: 'flex', flex: 1, minWidth: 0, fontSize: nameFs, fontWeight: 700,
          lineHeight: 1.05, color: s.win ? acc : C.chalk }}>
          {nm}</div>
        <div style={{ display: 'flex', flexShrink: 0, marginLeft: 8 }}>
          {scores.map((v, i) => (
            <div key={i} style={{ display: 'flex', width: 36, justifyContent: 'center', fontSize: 28, fontWeight: 700,
              color: s.win ? acc : C.silver, borderLeft: i > 0 ? `1px solid ${C.line}` : 'none' }}>
              {v ?? '–'}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const Card = ({ tie, title }: { tie: Tie; title: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', width: CW, background: C.turf,
      borderRadius: 16, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 18, fontWeight: 700, letterSpacing: 3,
        color: C.dim, padding: '9px 0', background: 'rgba(237,237,240,0.04)' }}>{title}</div>
      <Row s={tie.a} />
      <div style={{ display: 'flex', height: 1, background: C.line }} />
      <Row s={tie.b} />
    </div>
  )

  const Cup = () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: CW + 40, borderRadius: 20, overflow: 'hidden',
      border: `2px solid rgba(232,185,35,0.5)`, background: 'linear-gradient(180deg,#2B2410,#16161B)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 22, fontWeight: 700, letterSpacing: 6,
        color: GOLD, padding: '12px 0 10px' }}>ΤΕΛΙΚΟΣ</div>
      <Row s={fin.tie.a} gold />
      <div style={{ display: 'flex', height: 1, background: 'rgba(232,185,35,0.25)' }} />
      <Row s={fin.tie.b} gold />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0', background: 'rgba(232,185,35,0.12)',
        borderTop: '1px solid rgba(232,185,35,0.25)', fontSize: 26, fontWeight: 700, color: GOLD2 }}>
        {champ ? `ΠΡΩΤΑΘΛΗΤΗΣ · ${champ.name}` : 'ΠΡΩΤΑΘΛΗΤΗΣ'}
      </div>
    </div>
  )

  const Spacer = () => <div style={{ display: 'flex', flex: 1 }} />
  // Κάθετη γραμμή σύνδεσης (ραχοκοκαλιά ημιτελικοί ↔ τελικός)
  const Link = () => (
    <div style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
      <div style={{ display: 'flex', width: 3, alignSelf: 'stretch', background: 'rgba(232,185,35,0.35)' }} />
    </div>
  )

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: 'Deja', color: C.chalk, padding: story ? '70px 56px' : '56px 48px' }}>
        {/* header */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 8, color: GOLD }}>
            SALONICUP · PLAYOFF
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 52, fontWeight: 700 }}>{league?.name ?? ''}</div>
              <div style={{ display: 'flex', fontSize: 26, color: C.dim, marginTop: 4 }}>{league?.season ?? ''}</div>
            </div>
            {league?.logo_url
              ? <img src={league.logo_url} width={92} height={92}
                  style={{ width: 92, height: 92, objectFit: 'contain' }} />
              : <div style={{ display: 'flex' }} />}
          </div>
        </div>

        {/* bracket (χωνί) — spacers flex:1 για ομοιόμορφη κατανομή */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Card tie={t18.tie} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 1v8" />
            <Card tie={t45.tie} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 4v5" />
          </div>
          <Spacer />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Card tie={sTop.tie} title="ΗΜΙΤΕΛΙΚΟΣ 1" />
          </div>
          <Link />
          <div style={{ display: 'flex', justifyContent: 'center' }}><Cup /></div>
          <Link />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Card tie={sBot.tie} title="ΗΜΙΤΕΛΙΚΟΣ 2" />
          </div>
          <Spacer />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Card tie={t27.tie} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 2v7" />
            <Card tie={t36.tie} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 3v6" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18, fontSize: 22, color: C.dim, letterSpacing: 2 }}>
          Διπλά παιχνίδια · περνά η καλύτερη συνολική διαφορά · salonicup.gr
        </div>
      </div>
    ),
    { width: 1080, height: story ? 1920 : 1350, fonts }
  )
}

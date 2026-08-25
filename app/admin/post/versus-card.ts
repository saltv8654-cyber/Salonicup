import { drawPost, type PostData, type ThemeId } from './canvas'

/** Φορτώνει το Oswald (ίδιο με το admin/post) ώστε το κείμενο να βγει σωστά. */
async function ensureOswald() {
  if (typeof document === 'undefined') return
  if (!document.getElementById('oswald-font')) {
    const link = document.createElement('link')
    link.id = 'oswald-font'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap'
    document.head.appendChild(link)
  }
  try {
    await Promise.all([
      (document as any).fonts.load('500 40px Oswald'),
      (document as any).fonts.load('600 40px Oswald'),
      (document as any).fonts.load('700 40px Oswald'),
    ])
    await (document as any).fonts.ready
  } catch { /* fallback σε Arial Narrow */ }
}

const YT = { w: 1920, h: 1080 }

/** Miami στυλ για Summer League, αλλιώς πορτοκαλί. */
export function themeForLeague(name: string | undefined): ThemeId {
  const u = (name || '').toUpperCase()
  if (u.includes('SUMMER')) return 'miami'
  return 'orange'
}

export interface VersusCardOpts {
  match: any
  allMatches?: any[]      // αγώνες πρωταθλήματος (για φόρμα 5 τελευταίων)
  standings?: any[]       // βαθμολογία (θέση/βαθμοί)
  sponsors?: string[]     // λογότυπα χορηγών (URLs/data)
  theme?: ThemeId
  leagueName?: string
  leagueLogo?: string | null
  season?: string
}

/** Φτιάχνει το YouTube (1920×1080) γραφικό αναμέτρησης και επιστρέφει Blob. */
export async function buildVersusCard(opts: VersusCardOpts): Promise<Blob | null> {
  await ensureOswald()
  const { match: m, allMatches = [], standings = [], sponsors = [],
    theme = 'orange', leagueName = '', leagueLogo = null, season = '' } = opts

  const dt = m.match_date ? new Date(m.match_date) : null
  const formOf = (teamId: string): ('W' | 'D' | 'L')[] =>
    allMatches
      .filter(x => ['Played', 'Forfeit'].includes(x.match_status) &&
        (x.team_a === teamId || x.team_b === teamId))
      .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
      .slice(-5)
      .map(x => {
        const us = x.team_a === teamId
        const gf = us ? x.goals_team_a : x.goals_team_b
        const ga = us ? x.goals_team_b : x.goals_team_a
        return gf > ga ? 'W' : gf < ga ? 'L' : 'D'
      })
  const st = (teamId: string) => standings.find((s: any) => s.team_id === teamId)
  const sa = st(m.team_a), sb = st(m.team_b)

  const data: PostData = {
    type: 'versus',
    leagueName,
    sub: season,
    typeLabel: 'Αναμέτρηση',
    leagueLogo,
    groups: [],
    standings: [],
    versus: {
      homeName: m.team_a_data?.name ?? '—', homeLogo: m.team_a_data?.logo_url ?? null,
      awayName: m.team_b_data?.name ?? '—', awayLogo: m.team_b_data?.logo_url ?? null,
      day: dt ? dt.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric' }) : '',
      time: dt ? dt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '',
      field: m.field ?? '',
      homePos: sa?.position, homePts: sa?.points, homeForm: formOf(m.team_a),
      awayPos: sb?.position, awayPts: sb?.points, awayForm: formOf(m.team_b),
    },
    sponsors,
    theme,
  }

  const canvas = document.createElement('canvas')
  await drawPost(canvas, data, YT)
  return await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'))
}

/** Φτιάχνει και κατεβάζει το γραφικό αναμέτρησης (PNG). */
export async function downloadVersusCard(opts: VersusCardOpts): Promise<boolean> {
  const blob = await buildVersusCard(opts)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const nm = `${opts.match?.team_a_data?.name ?? 'A'}-${opts.match?.team_b_data?.name ?? 'B'}`
    .replace(/[^\p{L}\p{N}]+/gu, '_')
  a.download = `salonicup-vs-${nm}.png`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

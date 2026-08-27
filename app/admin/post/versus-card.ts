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

/**
 * Αποθηκεύει μια εικόνα: σε iPhone/Android ανοίγει το share sheet ώστε ο χρήστης
 * να πατήσει «Αποθήκευση εικόνας» (→ Φωτογραφίες)· αλλιώς κλασικό κατέβασμα (Αρχεία).
 * Επιστρέφει 'shared' | 'downloaded' | 'cancelled'.
 */
export async function saveImageBlob(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as any
  try {
    const file = new File([blob], filename, { type: 'image/png' })
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file] })
        return 'shared'
      } catch (e: any) {
        if (e?.name === 'AbortError') return 'cancelled'
        // αλλιώς πέφτουμε στο κατέβασμα
      }
    }
  } catch { /* File/share μη διαθέσιμα → κατέβασμα */ }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

/** Miami στυλ για Summer League, αλλιώς πορτοκαλί. */
export function themeForLeague(name: string | undefined): ThemeId {
  const u = (name || '').toUpperCase()
  if (u.includes('SUMMER')) return 'miami'
  return 'orange'
}

/** Αριθμός σκέλους (1/2) ενός playoff αγώνα, με βάση όλα τα ματς του πρωταθλήματος. */
export function legOfMatch(m: any, allMatches: any[]): number | undefined {
  if (!m.stage || m.stage === 'Final') return undefined
  const legs = allMatches
    .filter(x => x.stage === m.stage &&
      ((x.team_a === m.team_a && x.team_b === m.team_b) ||
       (x.team_a === m.team_b && x.team_b === m.team_a)))
    .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
  const idx = legs.findIndex(x => x.match_id === m.match_id)
  return idx >= 0 ? idx + 1 : 1
}

/** Ετικέτα φάσης/σκέλους για playoff (π.χ. "QUARTER-FINAL · 1ST LEG"), αλλιώς null. */
export function versusStageLabel(stage: string | null | undefined, leg?: number): string | null {
  const names: Record<string, string> = { QF: 'QUARTER-FINAL', SF: 'SEMI-FINAL', Final: 'FINAL' }
  const n = stage ? names[stage] : null
  if (!n) return null
  if (stage === 'Final') return n
  return `${n} · ${leg === 2 ? '2ND LEG' : '1ST LEG'}`
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
      tag: versusStageLabel(m.stage, legOfMatch(m, allMatches)) ?? undefined,
    },
    sponsors,
    theme,
  }

  const canvas = document.createElement('canvas')
  await drawPost(canvas, data, YT)
  return await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'))
}

/** Φτιάχνει και αποθηκεύει το γραφικό αναμέτρησης (→ Φωτογραφίες σε iPhone/Android). */
export async function downloadVersusCard(opts: VersusCardOpts): Promise<'shared' | 'downloaded' | 'cancelled' | false> {
  const blob = await buildVersusCard(opts)
  if (!blob) return false
  const nm = `${opts.match?.team_a_data?.name ?? 'A'}-${opts.match?.team_b_data?.name ?? 'B'}`
    .replace(/[^\p{L}\p{N}]+/gu, '_')
  return await saveImageBlob(blob, `salonicup-vs-${nm}.png`)
}

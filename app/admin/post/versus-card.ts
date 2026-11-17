import { drawPost, type PostData, type ThemeId } from './canvas'
import { buildVersus } from './build'

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

// Καθαρές συναρτήσεις: ζουν στο build.ts (κοινό με τον Social Agent).
export { themeForLeague, legOfMatch, versusStageLabel } from './build'

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
    theme = 'liga', leagueName = '', leagueLogo = null, season = '' } = opts

  const data: PostData = {
    type: 'versus',
    leagueName,
    sub: season,
    typeLabel: 'Αναμέτρηση',
    leagueLogo,
    groups: [],
    standings: [],
    versus: {
      ...buildVersus(m, allMatches, standings),
      // Η κάρτα YouTube κρατά τη δική της μορφή ημέρας (όπως πριν).
      day: m.match_date ? new Date(m.match_date).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Europe/Athens' }) : '',
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

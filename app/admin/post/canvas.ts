/* Σχεδίαση Instagram post 1080×1080 σε canvas (broadcast στυλ). */

export const S = 1080

const COL = {
  bgTop: '#0e1830',
  bgBottom: '#0a1020',
  orange1: '#FF7A2F',
  orange2: '#E05B1F',
  blue: '#7B9BE0',
  white: '#FFFFFF',
  dim: '#8892A6',
  card: 'rgba(255,255,255,0.06)',
  cardLine: 'rgba(255,255,255,0.10)',
  highlight: 'rgba(224,91,31,0.22)',
}

export type PostType = 'schedule' | 'results' | 'standings' | 'versus'

export interface Versus {
  homeName: string; homeLogo: string | null
  awayName: string; awayLogo: string | null
  day?: string; time?: string; field?: string
  homePos?: number; homePts?: number; homeForm?: ('W' | 'D' | 'L')[]
  awayPos?: number; awayPts?: number; awayForm?: ('W' | 'D' | 'L')[]
  poweredBy?: string
}

export interface MatchRow {
  homeName: string; homeLogo: string | null
  awayName: string; awayLogo: string | null
  time?: string; score?: string; field?: string
}
export interface StandRow {
  position: number; name: string; logo: string | null
  played: number; wins: number; draws: number; losses: number
  gd: number; points: number
}
export interface DayGroup { day: string; matches: MatchRow[] }

export interface PostData {
  type: PostType
  leagueName: string
  sub: string
  typeLabel: string
  leagueLogo: string | null
  groups: DayGroup[]
  standings: StandRow[]
  versus?: Versus
}

/* ── helpers ── */
function loadImg(url: string | null): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    if (!url) return res(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })
}

function font(w: number, size: number) {
  return `${w} ${size}px Oswald, "Arial Narrow", sans-serif`
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fit(ctx: any, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

/* Θυρεός: λογότυπο σε κύκλο, αλλιώς αρχικό γράμμα. */
function crest(ctx: any, img: HTMLImageElement | null, name: string, cx: number, cy: number, size: number) {
  const r = size / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  if (img) {
    ctx.clip()
    ctx.drawImage(img, cx - r, cy - r, size, size)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fill()
    ctx.fillStyle = COL.white
    ctx.font = font(700, size * 0.5)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((name?.[0] ?? '?').toUpperCase(), cx, cy + size * 0.03)
  }
  ctx.restore()
}

/* ── main ── */
export async function drawPost(canvas: HTMLCanvasElement, d: PostData, size?: { w: number; h: number }) {
  const W = size?.w ?? S
  const H = size?.h ?? S
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  // preload όλα τα λογότυπα
  const teamUrls = new Set<string>()
  d.groups.forEach((g) => g.matches.forEach((m) => {
    if (m.homeLogo) teamUrls.add(m.homeLogo)
    if (m.awayLogo) teamUrls.add(m.awayLogo)
  }))
  d.standings.forEach((s) => { if (s.logo) teamUrls.add(s.logo) })
  if (d.versus?.homeLogo) teamUrls.add(d.versus.homeLogo)
  if (d.versus?.awayLogo) teamUrls.add(d.versus.awayLogo)
  const urls = [d.leagueLogo, ...Array.from(teamUrls)]
  const imgs = await Promise.all(urls.map(loadImg))
  const map = new Map<string, HTMLImageElement | null>()
  urls.forEach((u, i) => { if (u) map.set(u, imgs[i]) })
  const L = (u: string | null) => (u ? map.get(u) ?? null : null)

  /* φόντο */
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, COL.bgTop)
  bg.addColorStop(1, COL.bgBottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  /* πορτοκαλί λωρίδα κορυφής */
  const strip = ctx.createLinearGradient(0, 0, W, 0)
  strip.addColorStop(0, COL.orange1)
  strip.addColorStop(1, COL.orange2)
  ctx.fillStyle = strip
  ctx.fillRect(0, 0, W, 12)

  /* ── κεφαλίδα ── */
  const PAD = 60
  crest(ctx, L(d.leagueLogo), d.leagueName, PAD + 50, 128, 100)
  const tx = PAD + 122
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COL.orange1
  ctx.font = font(600, 26)
  ctx.fillText('SALONICUP', tx, 96)
  ctx.fillStyle = COL.white
  ctx.font = font(700, 52)
  ctx.fillText(fit(ctx, d.leagueName.toUpperCase(), 620), tx, 150)
  ctx.fillStyle = COL.blue
  ctx.font = font(500, 27)
  ctx.fillText(d.sub, tx, 188)

  /* ετικέτα τύπου (δεξιά) */
  ctx.font = font(700, 26)
  const label = d.typeLabel.toUpperCase()
  const lw = ctx.measureText(label).width
  const pillW = lw + 44
  const pillH = 52
  const pillX = W - PAD - pillW
  const pill = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0)
  pill.addColorStop(0, COL.orange1)
  pill.addColorStop(1, COL.orange2)
  ctx.fillStyle = pill
  roundRect(ctx, pillX, 78, pillW, pillH, pillH / 2)
  ctx.fill()
  ctx.fillStyle = COL.white
  ctx.textAlign = 'center'
  ctx.fillText(label, pillX + pillW / 2, 78 + 35)

  /* γραμμή διαχωρισμού */
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 210)
  ctx.lineTo(W - PAD, 210)
  ctx.stroke()

  /* ── σώμα ── */
  if (d.type === 'standings') drawStandings(ctx, d, L)
  else if (d.type === 'versus') drawVersus(ctx, d, L, W, H)
  else drawMatches(ctx, d, L)

  /* υποσέλιδο */
  ctx.fillStyle = COL.dim
  ctx.font = font(600, 24)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.save()
  ;(ctx as any).letterSpacing = '4px'
  ctx.fillText('SALONICUP.GR', W / 2, H - 40)
  ctx.restore()
}

function formPills(ctx: any, form: ('W' | 'D' | 'L')[], cx: number, y: number) {
  const n = form.length
  if (!n) return
  const s = 40, gapp = 8
  const totalW = n * s + (n - 1) * gapp
  let x = cx - totalW / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const r of form) {
    ctx.fillStyle = r === 'W' ? '#2FA84F' : r === 'L' ? '#D8483C' : '#6B6B75'
    roundRect(ctx, x, y, s, s, 8)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = font(700, 22)
    ctx.fillText(r === 'W' ? 'Ν' : r === 'L' ? 'Η' : 'Ι', x + s / 2, y + s / 2 + 1)
    x += s + gapp
  }
}

function drawVersus(ctx: any, d: PostData, L: (u: string | null) => HTMLImageElement | null, W: number, H: number) {
  const v = d.versus
  if (!v) return
  const cx = W / 2
  const size = Math.min(W, H) * 0.25
  const gap = Math.min(W * 0.25, 540)
  const leftX = cx - gap
  const rightX = cx + gap
  const nameMax = gap * 1.7
  const cy = H * 0.44

  // Πλαίσιο ημέρας/ώρας (πάνω, κάτω από κεφαλίδα)
  const info = [v.day, v.time].filter(Boolean).join('  ·  ').toUpperCase()
  if (info) {
    ctx.font = font(700, 44)
    const w = ctx.measureText(info).width + 76
    const h = 82
    const x = cx - w / 2
    const g = ctx.createLinearGradient(x, 0, x + w, 0)
    g.addColorStop(0, COL.orange1)
    g.addColorStop(1, COL.orange2)
    ctx.fillStyle = g
    roundRect(ctx, x, 250, w, h, h / 2)
    ctx.fill()
    ctx.fillStyle = COL.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(info, cx, 250 + h / 2 + 2)
  }

  // Θυρεοί + VS
  crest(ctx, L(v.homeLogo), v.homeName, leftX, cy, size)
  crest(ctx, L(v.awayLogo), v.awayName, rightX, cy, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COL.orange1
  ctx.font = font(700, size * 0.46)
  ctx.fillText('VS', cx, cy)

  // Ονόματα
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COL.white
  ctx.font = font(700, Math.min(size * 0.22, 56))
  ctx.textAlign = 'center'
  const nameY = cy + size * 0.62 + 62
  ctx.fillText(fit(ctx, v.homeName.toUpperCase(), nameMax), leftX, nameY)
  ctx.fillText(fit(ctx, v.awayName.toUpperCase(), nameMax), rightX, nameY)

  // Θέση / βαθμοί
  ctx.font = font(600, 30)
  ctx.fillStyle = COL.blue
  const posLine = (pos?: number, pts?: number) =>
    pos ? `${pos}η θέση · ${pts ?? 0} βαθ.` : ''
  if (v.homePos) ctx.fillText(posLine(v.homePos, v.homePts), leftX, nameY + 46)
  if (v.awayPos) ctx.fillText(posLine(v.awayPos, v.awayPts), rightX, nameY + 46)

  // Φόρμα (τελευταία 5)
  if (v.homeForm?.length) formPills(ctx, v.homeForm, leftX, nameY + 74)
  if (v.awayForm?.length) formPills(ctx, v.awayForm, rightX, nameY + 74)

  // Γήπεδο
  if (v.field) {
    ctx.fillStyle = COL.blue
    ctx.font = font(500, 36)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`📍 ${v.field}`, cx, H - 150)
  }

  // Powered by (χορηγοί)
  if (v.poweredBy) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = COL.dim
    ctx.font = font(600, 24)
    ctx.fillText('POWERED BY', cx, H - 100)
    ctx.fillStyle = COL.white
    ctx.font = font(700, 40)
    ctx.fillText(v.poweredBy, cx, H - 62)
  }
}

function drawMatches(ctx: any, d: PostData, L: (u: string | null) => HTMLImageElement | null) {
  const PAD = 60
  const cardW = S - PAD * 2
  const total = d.groups.reduce((n, g) => n + g.matches.length, 0)
  const cardH = 96
  const gap = 14
  const dayH = 54
  let y = 260

  d.groups.forEach((g) => {
    // τίτλος ημέρας (μπλε, κεντραρισμένος)
    ctx.fillStyle = COL.blue
    ctx.font = font(600, 30)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(g.day.toUpperCase(), S / 2, y + 34)
    y += dayH

    g.matches.forEach((m) => {
      // κάρτα
      ctx.fillStyle = COL.card
      roundRect(ctx, PAD, y, cardW, cardH, 18)
      ctx.fill()
      ctx.strokeStyle = COL.cardLine
      ctx.lineWidth = 1.5
      roundRect(ctx, PAD, y, cardW, cardH, 18)
      ctx.stroke()

      const cy = y + cardH / 2
      // γηπεδούχος (αριστερά)
      crest(ctx, L(m.homeLogo), m.homeName, PAD + 30 + 28, cy, 56)
      ctx.fillStyle = COL.white
      ctx.font = font(600, 30)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(fit(ctx, m.homeName, 300), PAD + 100, cy)

      // κέντρο: ώρα (πορτοκαλί) ή σκορ (άσπρο) + γήπεδο από κάτω
      ctx.textAlign = 'center'
      if (m.score != null) {
        ctx.fillStyle = COL.white
        ctx.font = font(700, 46)
        ctx.fillText(m.score, S / 2, m.field ? cy - 12 : cy)
      } else {
        ctx.fillStyle = COL.orange1
        ctx.font = font(700, 40)
        ctx.fillText(m.time ?? '', S / 2, m.field ? cy - 12 : cy)
      }
      if (m.field) {
        ctx.fillStyle = COL.dim
        ctx.font = font(600, 22)
        ctx.fillText(m.field, S / 2, cy + 26)
      }

      // φιλοξενούμενος (δεξιά)
      const rx = S - PAD - 30 - 28
      crest(ctx, L(m.awayLogo), m.awayName, rx, cy, 56)
      ctx.fillStyle = COL.white
      ctx.font = font(600, 30)
      ctx.textAlign = 'right'
      ctx.fillText(fit(ctx, m.awayName, 300), S - PAD - 100, cy)

      y += cardH + gap
    })
    y += 6
  })

  if (total === 0) {
    ctx.fillStyle = COL.dim
    ctx.font = font(500, 34)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Δεν υπάρχουν αγώνες', S / 2, 560)
  }
}

function drawStandings(ctx: any, d: PostData, L: (u: string | null) => HTMLImageElement | null) {
  const PAD = 60
  const rows = d.standings.slice(0, 10)
  const colB = S - PAD - 24
  const colGD = colB - 78
  const colL = colGD - 78
  const colI = colL - 68
  const colN = colI - 68
  const colA = colN - 68

  // κεφαλίδα στηλών
  let y = 262
  ctx.fillStyle = COL.blue
  ctx.font = font(600, 22)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillText('#', PAD + 22, y)
  ctx.textAlign = 'left'
  ctx.fillText('ΟΜΑΔΑ', PAD + 60, y)
  ctx.textAlign = 'center'
  ctx.fillText('Α', colA, y)
  ctx.fillText('Ν', colN, y)
  ctx.fillText('Ι', colI, y)
  ctx.fillText('Η', colL, y)
  ctx.fillText('ΔΓ', colGD, y)
  ctx.fillStyle = COL.orange1
  ctx.fillText('Β', colB, y)

  y = 286
  const rowH = Math.min(70, (940 - y) / Math.max(rows.length, 1))

  rows.forEach((t, i) => {
    const top = y + i * rowH
    const cy = top + rowH / 2
    if (i === 0) {
      ctx.fillStyle = COL.highlight
      roundRect(ctx, PAD - 4, top + 4, S - PAD * 2 + 8, rowH - 8, 12)
      ctx.fill()
    }
    ctx.textBaseline = 'middle'
    // θέση
    ctx.fillStyle = i === 0 ? COL.orange1 : i < 3 ? COL.white : COL.dim
    ctx.font = font(700, 30)
    ctx.textAlign = 'center'
    ctx.fillText(String(t.position), PAD + 22, cy)
    // λογότυπο + όνομα
    crest(ctx, L(t.logo), t.name, PAD + 82, cy, 42)
    ctx.fillStyle = COL.white
    ctx.font = font(600, 28)
    ctx.textAlign = 'left'
    ctx.fillText(fit(ctx, t.name, colA - (PAD + 112) - 20), PAD + 112, cy)
    // στατιστικά
    ctx.font = font(500, 26)
    ctx.textAlign = 'center'
    ctx.fillStyle = COL.dim
    ctx.fillText(String(t.played), colA, cy)
    ctx.fillStyle = COL.white
    ctx.fillText(String(t.wins), colN, cy)
    ctx.fillStyle = COL.dim
    ctx.fillText(String(t.draws), colI, cy)
    ctx.fillText(String(t.losses), colL, cy)
    ctx.fillStyle = t.gd > 0 ? COL.orange1 : t.gd < 0 ? '#9E5148' : COL.dim
    ctx.fillText(t.gd > 0 ? `+${t.gd}` : String(t.gd), colGD, cy)
    ctx.fillStyle = COL.white
    ctx.font = font(700, 28)
    ctx.fillText(String(t.points), colB, cy)
  })
}

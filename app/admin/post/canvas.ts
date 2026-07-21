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

/* Χρωματικά θέματα ανά πρωτάθλημα (accent + φόντο). */
export type ThemeId = 'orange' | 'yellow' | 'miami'
export const THEMES: Record<ThemeId, { label: string; accent: string; accent2: string; bgTop: string; bgBottom: string }> = {
  orange: { label: 'Πορτοκαλί', accent: '#FF7A2F', accent2: '#E05B1F', bgTop: '#0e1830', bgBottom: '#0a1020' },
  yellow: { label: 'Κίτρινο',   accent: '#F2C230', accent2: '#D8A21F', bgTop: '#1a1608', bgBottom: '#0e0c05' },
  miami:  { label: 'Miami',     accent: '#ff2d95', accent2: '#d81f7a', bgTop: '#1a0d3d', bgBottom: '#0a0618' },
}

export interface Versus {
  homeName: string; homeLogo: string | null
  awayName: string; awayLogo: string | null
  day?: string; time?: string; field?: string
  homePos?: number; homePts?: number; homeForm?: ('W' | 'D' | 'L')[]
  awayPos?: number; awayPts?: number; awayForm?: ('W' | 'D' | 'L')[]
  theme?: ThemeId
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
  sponsors?: string[]
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
  d.sponsors?.forEach((u) => { if (u) teamUrls.add(u) })
  const urls = [d.leagueLogo, ...Array.from(teamUrls)]
  const imgs = await Promise.all(urls.map(loadImg))
  const map = new Map<string, HTMLImageElement | null>()
  urls.forEach((u, i) => { if (u) map.set(u, imgs[i]) })
  const L = (u: string | null) => (u ? map.get(u) ?? null : null)

  /* παλέτα: θέμα ανά πρωτάθλημα μόνο στην Αναμέτρηση, αλλιώς πορτοκαλί */
  const t = d.type === 'versus' && d.versus?.theme ? THEMES[d.versus.theme] : null
  const pal = {
    accent:   t?.accent ?? COL.orange1,
    accent2:  t?.accent2 ?? COL.orange2,
    bgTop:    t?.bgTop ?? COL.bgTop,
    bgBottom: t?.bgBottom ?? COL.bgBottom,
  }

  /* φόντο */
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, pal.bgTop)
  bg.addColorStop(1, pal.bgBottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  /* διακριτική υφή φόντου (ομόκεντροι κύκλοι + διαγώνια τρίγωνα) */
  if (d.type === 'versus') versusTexture(ctx, pal, W, H)

  /* λωρίδα κορυφής (accent) */
  const strip = ctx.createLinearGradient(0, 0, W, 0)
  strip.addColorStop(0, pal.accent)
  strip.addColorStop(1, pal.accent2)
  ctx.fillStyle = strip
  ctx.fillRect(0, 0, W, 12)

  /* ── κεφαλίδα ── */
  const PAD = 60
  crest(ctx, L(d.leagueLogo), d.leagueName, PAD + 50, 128, 100)
  const tx = PAD + 122
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = pal.accent
  ctx.font = font(600, 26)
  ctx.fillText('SALONICUP', tx, 96)
  ctx.fillStyle = COL.white
  ctx.font = font(700, 52)
  ctx.fillText(fit(ctx, d.leagueName.toUpperCase(), W - tx - 260), tx, 150)
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
  pill.addColorStop(0, pal.accent)
  pill.addColorStop(1, pal.accent2)
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

  /* χορηγοί (Powered by) */
  const sImgs = (d.sponsors ?? []).map((u) => L(u)).filter(Boolean) as HTMLImageElement[]
  const hasSp = sImgs.length > 0

  /* ── σώμα ── */
  const bodyBottom = hasSp ? H - 165 : H - 64
  if (d.type === 'standings') drawStandings(ctx, d, L, bodyBottom)
  else if (d.type === 'versus') drawVersus(ctx, d, L, W, H, pal)
  else drawMatches(ctx, d, L, bodyBottom)

  /* λωρίδα χορηγών (μη-Αναμέτρηση· η Αναμέτρηση τους ζωγραφίζει στοιβαγμένους) */
  if (hasSp && d.type !== 'versus') drawSponsorStrip(ctx, sImgs, W, H - 96)

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

/* Οριζόντια λωρίδα χορηγών: λογότυπα σε άσπρα chips δίπλα-δίπλα. */
function drawSponsorStrip(ctx: any, imgs: HTMLImageElement[], W: number, cy: number) {
  const n = imgs.length
  const pad = 12, gap = 20, chipH = 62, logoH = chipH - pad * 2
  const maxLogoW = (W - 220) / n - gap
  const chips = imgs.map((img) => {
    const ar = (img.width || 1) / (img.height || 1)
    let lw = logoH * ar, lh = logoH
    if (lw > maxLogoW) { lw = maxLogoW; lh = lw / ar }
    return { img, lw, lh, cw: lw + pad * 2 }
  })
  const total = chips.reduce((s, c) => s + c.cw, 0) + gap * (n - 1)

  ctx.fillStyle = COL.dim
  ctx.font = font(600, 18)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.save(); ;(ctx as any).letterSpacing = '3px'
  ctx.fillText('POWERED BY', W / 2, cy - chipH / 2 - 16)
  ctx.restore()

  let x = W / 2 - total / 2
  for (const c of chips) {
    ctx.fillStyle = COL.white
    roundRect(ctx, x, cy - chipH / 2, c.cw, chipH, 14)
    ctx.fill()
    ctx.drawImage(c.img, x + (c.cw - c.lw) / 2, cy - c.lh / 2, c.lw, c.lh)
    x += c.cw + gap
  }
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

type Pal = { accent: string; accent2: string; bgTop: string; bgBottom: string }

/* Διακριτική υφή: δύο ομόκεντροι κύκλοι στο κέντρο + διαγώνια τρίγωνα στις άκρες. */
function versusTexture(ctx: any, pal: Pal, W: number, H: number) {
  const cx = W / 2
  const cy = H * 0.42
  const R = Math.min(W, H)
  ctx.save()
  // ομόκεντροι κύκλοι
  ctx.strokeStyle = pal.accent
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.07
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 0.05
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.48, 0, Math.PI * 2); ctx.stroke()
  // διαγώνια τρίγωνα στις γωνίες
  ctx.fillStyle = pal.accent
  ctx.globalAlpha = 0.05
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.24, 0); ctx.lineTo(0, H * 0.15); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W - W * 0.24, H); ctx.lineTo(W, H - H * 0.15); ctx.closePath(); ctx.fill()
  ctx.restore()
}

/* Σήμα ομάδας σε άσπρο στρογγυλεμένο πλαίσιο (contain). */
function logoBox(ctx: any, img: HTMLImageElement | null, name: string, cx: number, cy: number, box: number, pal: Pal) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  ctx.fillStyle = COL.white
  roundRect(ctx, cx - box / 2, cy - box / 2, box, box, box * 0.2)
  ctx.fill()
  ctx.restore()

  const pad = box * 0.16
  const inner = box - pad * 2
  if (img) {
    const ar = (img.width || 1) / (img.height || 1)
    let dw = inner, dh = inner
    if (ar > 1) dh = inner / ar
    else dw = inner * ar
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  } else {
    ctx.fillStyle = pal.accent
    ctx.font = font(700, box * 0.5)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((name?.[0] ?? '?').toUpperCase(), cx, cy + box * 0.02)
  }
}

function drawVersus(ctx: any, d: PostData, L: (u: string | null) => HTMLImageElement | null, W: number, H: number, pal: Pal) {
  const v = d.versus
  if (!v) return
  const cx = W / 2
  const box = Math.min(W, H) * 0.24
  const offset = Math.min(W * 0.26, box + 100)
  const leftX = cx - offset
  const rightX = cx + offset
  const nameMax = offset * 1.55
  const cy = H * 0.37

  // Σήματα σε άσπρα πλαίσια + VS
  logoBox(ctx, L(v.homeLogo), v.homeName, leftX, cy, box, pal)
  logoBox(ctx, L(v.awayLogo), v.awayName, rightX, cy, box, pal)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = pal.accent
  ctx.font = font(700, box * 0.52)
  ctx.fillText('VS', cx, cy)

  // Ονόματα + θέση
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  const nameY = cy + box / 2 + 62
  const nameSize = Math.min(box * 0.22, 54)

  const team = (name: string, pos: number | undefined, x: number) => {
    ctx.fillStyle = COL.white
    ctx.font = font(700, nameSize)
    ctx.fillText(fit(ctx, name.toUpperCase(), nameMax), x, nameY)
    if (pos != null) {
      ctx.fillStyle = pal.accent
      ctx.font = font(600, 34)
      ctx.fillText(`${pos}η θέση`, x, nameY + 48)
    }
  }
  team(v.homeName, v.homePos, leftX)
  team(v.awayName, v.awayPos, rightX)
  const bottomOfTeams = nameY + (v.homePos != null || v.awayPos != null ? 48 : 0)

  // Γήπεδο · μέρα · ώρα ανάμεσα σε δύο οριζόντιες γραμμές
  const parts = [v.field ? `📍 ${v.field}` : '', v.day, v.time].filter(Boolean)
  const line = parts.join('   ·   ').toUpperCase()
  const venueY = H - 150
  if (line) {
    ctx.font = font(600, 38)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(line).width
    const ruleW = Math.min(W - 160, tw + 140)
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(cx - ruleW / 2, venueY - 38); ctx.lineTo(cx + ruleW / 2, venueY - 38); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - ruleW / 2, venueY + 38); ctx.lineTo(cx + ruleW / 2, venueY + 38); ctx.stroke()
    ctx.fillStyle = COL.white
    ctx.fillText(line, cx, venueY + 2)
  }

  // Powered by — χορηγοί (λογότυπα σε άσπρα chips, το ένα κάτω από το άλλο)
  const sImgs = (d.sponsors ?? []).map((u) => L(u)).filter(Boolean) as HTMLImageElement[]
  if (sImgs.length) {
    const chipH = 62, pad = 12, gap = 14, logoH = chipH - pad * 2
    const labelGap = 18
    const blockH = 22 + labelGap + sImgs.length * chipH + (sImgs.length - 1) * gap
    const regionTop = bottomOfTeams + 40
    const regionBottom = line ? venueY - 38 - 30 : venueY + 30
    let y = regionTop + Math.max(0, (regionBottom - regionTop - blockH) / 2)

    ctx.fillStyle = COL.dim
    ctx.font = font(600, 20)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.save(); ;(ctx as any).letterSpacing = '4px'
    ctx.fillText('POWERED BY', cx, y + 11)
    ctx.restore()
    y += 22 + labelGap

    const maxChipW = W * 0.52
    for (const img of sImgs) {
      const ar = (img.width || 1) / (img.height || 1)
      let lw = logoH * ar, lh = logoH
      const maxLogoW = maxChipW - pad * 2
      if (lw > maxLogoW) { lw = maxLogoW; lh = lw / ar }
      const chipW = lw + pad * 2
      const chipX = cx - chipW / 2
      ctx.fillStyle = COL.white
      roundRect(ctx, chipX, y, chipW, chipH, 14)
      ctx.fill()
      ctx.drawImage(img, cx - lw / 2, y + (chipH - lh) / 2, lw, lh)
      y += chipH + gap
    }
  }
}

function drawMatches(ctx: any, d: PostData, L: (u: string | null) => HTMLImageElement | null, bottom = S - 64) {
  const PAD = 60
  const cardW = S - PAD * 2
  const total = d.groups.reduce((n, g) => n + g.matches.length, 0)
  const nDays = d.groups.length
  const gap = 14
  const dayH = 54
  const top = 260
  // ύψος κάρτας ώστε να χωράνε όλες πάνω από το υποσέλιδο/χορηγούς
  let cardH = 96
  const needed = nDays * dayH + total * (cardH + gap) + nDays * 6
  if (needed > bottom - top) {
    cardH = Math.max(60, (bottom - top - nDays * dayH - total * gap - nDays * 6) / Math.max(total, 1))
  }
  let y = top

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

function drawStandings(ctx: any, d: PostData, L: (u: string | null) => HTMLImageElement | null, bottom = S - 64) {
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
  const rowH = Math.min(70, (bottom - y) / Math.max(rows.length, 1))

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

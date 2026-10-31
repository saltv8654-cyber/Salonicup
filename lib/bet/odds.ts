// Salonicup Bet — μηχανή αποδόσεων από στατιστική ανάλυση.
// Μοντέλο Poisson: υπολογίζει αναμενόμενα γκολ κάθε ομάδας από επίθεση/άμυνα
// (γκολ υπέρ/κατά ανά αγώνα σε σχέση με τον μέσο όρο του πρωταθλήματος) και
// βγάζει πιθανότητες 1/Χ/2, Over/Under 2.5 και Goal/Goal. Οι αποδόσεις προκύπτουν
// από τις πιθανότητες με ένα περιθώριο (overround).

export type TeamStat = {
  played: number
  gf: number          // γκολ υπέρ (σύνολο)
  ga: number          // γκολ κατά (σύνολο)
  points: number
  position: number
  form?: number       // 0..1 πρόσφατη φόρμα (πόντοι τελευταίων / μέγιστο), προαιρετικό
}

export type Odds = {
  home: number; draw: number; away: number
  over25: number; under25: number
  bttsYes: number; bttsNo: number
  pHome: number; pDraw: number; pAway: number
  pOver: number; pBtts: number
  lambdaHome: number; lambdaAway: number
}

const MARGIN = 1.07      // overround ~7% (το «κόστος» του πράκτορα)
const HOME_ADV = 1.00    // χωρίς πλεονέκτημα έδρας — όλοι παίζουν στα ίδια γήπεδα
const MIN_ODDS = 1.05
const MAX_ODDS = 25

function factorial(n: number): number {
  let f = 1
  for (let i = 2; i <= n; i++) f *= i
  return f
}
function poisson(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k)
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
function priceFromProb(p: number): number {
  if (p <= 0) return MAX_ODDS
  const o = (1 / p) / MARGIN
  return clamp(Math.round(o * 100) / 100, MIN_ODDS, MAX_ODDS)
}

/**
 * @param base Μέσος όρος γκολ ανά ομάδα ανά αγώνα στο πρωτάθλημα (π.χ. 1.4).
 *             Υπολογισμός: sum(gf) / sum(played) όλων των ομάδων.
 */
/** Ιστορικό αναμετρήσεων των δύο ομάδων (από όλο το αρχείο αγώνων). */
export type H2H = { homeGoals: number; awayGoals: number; meetings: number }

export function computeOdds(home: TeamStat, away: TeamStat, base: number, h2h?: H2H): Odds {
  const b = clamp(base || 1.3, 0.6, 4)
  const atk = (t: TeamStat) => (t.played > 0 ? clamp((t.gf / t.played) / b, 0.25, 3) : 1)
  const def = (t: TeamStat) => (t.played > 0 ? clamp((t.ga / t.played) / b, 0.25, 3) : 1)

  // ── ΣΥΝΟΛΙΚΑ αναμενόμενα γκολ (για Over/Under & Goal-Goal) — από τα γκολ ──
  const egH = b * atk(home) * def(away)
  const egA = b * atk(away) * def(home)
  const T = clamp((egH + egA) * HOME_ADV, 0.6, 10)   // HOME_ADV=1 → ουδέτερο

  // ── ΠΟΙΟΣ ΕΙΝΑΙ ΦΑΒΟΡΙ (κατανομή των γκολ) ──
  // Σειρά βαρύτητας: 1) βαθμολογία  2) φόρμα  3) μεταξύ τους  4) γκολ υπέρ/κατά
  const ppg = (t: TeamStat) => clamp(t.played > 0 ? t.points / t.played : 1, 0, 3)
  const gd  = (t: TeamStat) => (t.played > 0 ? (t.gf - t.ga) / t.played : 0)
  const fH = home.form ?? 0.5, fA = away.form ?? 0.5
  let h2hAdv = 0
  if (h2h && h2h.meetings >= 1) {
    const tot = h2h.homeGoals + h2h.awayGoals
    h2hAdv = (tot > 0 ? (h2h.homeGoals - h2h.awayGoals) / tot : 0) * Math.min(1, h2h.meetings / 2)
  }
  const diff = clamp(
      0.50 * ((ppg(home) - ppg(away)) / 3)          // βαθμολογία (πόντοι/αγώνα)
    + 0.30 * (fH - fA)                              // φόρμα
    + 0.12 * h2hAdv                                 // μεταξύ τους
    + 0.08 * clamp((gd(home) - gd(away)) / 6, -1, 1) // γκολ υπέρ/κατά
    , -1, 1)
  // Πιο «μαζεμένη» κατανομή: σε ματς με πολλά γκολ, το Poisson δίνει ακραία φαβορί,
  // οπότε περιορίζουμε το άνοιγμα ώστε δύο κοντινές ομάδες να βγαίνουν κοντά.
  const shareH = clamp(0.5 + 0.30 * diff, 0.36, 0.64)
  const lH = clamp(T * shareH, 0.15, 7)
  const lA = clamp(T * (1 - shareH), 0.15, 7)

  const N = 16
  let pH = 0, pD = 0, pA = 0, pOver = 0, pBtts = 0
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p = poisson(i, lH) * poisson(j, lA)
      if (i > j) pH += p
      else if (i === j) pD += p
      else pA += p
      if (i + j >= 8) pOver += p     // Over 7.5 = 8+ γκολ (8x8/7x7 → πολλά γκολ)
      if (i > 0 && j > 0) pBtts += p // Goal/Goal
    }
  }
  // Κανονικοποίηση (η μήτρα κόβεται στα 15 γκολ ανά ομάδα)
  const s = pH + pD + pA || 1
  pH /= s; pD /= s; pA /= s
  pOver = clamp(pOver, 0.02, 0.98)
  pBtts = clamp(pBtts, 0.02, 0.98)

  return {
    home: priceFromProb(pH), draw: priceFromProb(pD), away: priceFromProb(pA),
    over25: priceFromProb(pOver), under25: priceFromProb(1 - pOver),
    bttsYes: priceFromProb(pBtts), bttsNo: priceFromProb(1 - pBtts),
    pHome: pH, pDraw: pD, pAway: pA, pOver, pBtts,
    lambdaHome: Math.round(lH * 100) / 100, lambdaAway: Math.round(lA * 100) / 100,
  }
}

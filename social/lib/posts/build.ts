/* Δεδομένα για τα posts της καρτέλας «Posts» (καθαρές συναρτήσεις, χωρίς DOM και χωρίς βάση).
 * Κοινός κώδικας: χρησιμοποιείται από την καρτέλα ΚΑΙ από τον Social Agent (αντίγραφο στο
 * social/lib/posts — το test εκεί ελέγχει ότι είναι ίδιο). Όλες οι ώρες σε ζώνη Ελλάδας.
 *
 * Οι αγώνες έχουν το σχήμα που φέρνει η καρτέλα:
 *   matches.*, team_a_data: { name, logo_url }, team_b_data: { name, logo_url }, league?: { name, logo_url, sort_order }
 */
import type { DayGroup, Final, MatchRow, Mvp, ThemeId, Versus } from './canvas'

export const TZ = 'Europe/Athens'
const DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο']
const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: TZ }

/** Κλειδί ημέρας «YYYY-MM-DD» σε ζώνη Ελλάδας. */
export function athensDateKey(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}
/** «21:00» */
export function fmtTime(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('el-GR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
}
/** «Κυριακή 20/7» */
export function fmtDay(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  const wd = new Date(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)).getDay()
  return `${DAYS[wd]} ${g('day')}/${g('month')}`
}
/** «Κυριακή 20/7» όπως το toLocaleDateString της καρτέλας (για τίτλους ημέρας). */
export const dayTitle = (iso: string) => new Date(iso).toLocaleDateString('el-GR', DAY_FMT)

/** Λεπτό όπως στο app: ο speaker γράφει λεπτό σχετικό με το ημίχρονο (30' + 30', παράταση 5'). */
const PERIOD_BASE: Record<string, { base: number; cap: number }> = { H1: { base: 0, cap: 30 }, H2: { base: 30, cap: 30 }, ET: { base: 60, cap: 5 } }
export function fmtMinute(period: string, raw: number | null | undefined) {
  const P = PERIOD_BASE[period]
  if (!P || raw == null) return ''
  return raw > P.cap ? `${P.base + P.cap}+${raw - P.cap}'` : `${P.base + raw}'`
}
export function absMinute(period: string, raw: number | null | undefined) {
  const P = PERIOD_BASE[period]
  if (!P) return 9999
  const n = raw ?? 0
  return P.base + Math.min(n, P.cap) + (n > P.cap ? (n - P.cap) * 0.1 : 0)
}

export const STAGE_SHORT: Record<string, string> = { QF: 'ΠΡΟΗΜ.', SF: 'ΗΜΙΤΕΛ.', Final: 'ΤΕΛΙΚΟΣ' }

/** Χάρτης match_id → αριθμός σκέλους (1/2) για διπλά playoff (QF/SF). */
export function buildLegMap(list: any[]) {
  const groups = new Map<string, any[]>()
  for (const m of list) {
    if (!m.stage || m.stage === 'Final') continue
    const pair = [m.team_a, m.team_b].slice().sort().join('-')
    const k = `${m.league_id}:${m.stage}:${pair}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(m)
  }
  const out = new Map<string, number>()
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
    arr.forEach((m, i) => out.set(m.match_id, i + 1))
  }
  return out
}

/** Χρυσό σήμα playoff για μια κάρτα αγώνα, ή undefined αν είναι κανονικός. */
export function playoffTag(m: any, legMap: Map<string, number>): string | undefined {
  const s = STAGE_SHORT[m.stage as string]
  if (!s) return undefined
  const leg = legMap.get(m.match_id)
  const legLbl = m.stage === 'Final' ? '' : leg === 2 ? ' Β΄' : ' Α΄'
  return `PLAYOFF · ${s}${legLbl}`
}

/** Οι 7 ημέρες (Δευτ→Κυρ) της εβδομάδας που περιέχει το dateKey, ως {key, label}. */
export function weekDays(dateKey: string): { key: string; label: string }[] {
  const base = new Date(`${dateKey}T12:00:00Z`)
  const dow = (base.getUTCDay() + 6) % 7 // 0=Δευτ … 6=Κυρ
  const mon = new Date(base); mon.setUTCDate(base.getUTCDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i)
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' }),
    }
  })
}

/** Θέμα ανά πρωτάθλημα (χρώματα PL-style). */
export function themeForLeague(name: string | undefined): ThemeId {
  const u = (name || '').toUpperCase()
  if (u.includes('SUMMER')) return 'miami'
  if (u.includes('LIGA')) return 'liga'
  if (u.includes('MASTER')) return 'master'
  if (u.includes('TROPHY') || u.includes('SKG')) return 'trophy'
  if (u.includes('FANTASY')) return 'fantasy'
  if (u.includes('LEGEND')) return 'legends'
  return 'liga'
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

/** «QF:1» / «Final» → φάση playoff, αλλιώς null (κανονική αγωνιστική). */
export function parseStageRound(r: string): { stage: string; leg?: number } | null {
  const [stage, leg] = (r || '').split(':')
  if (stage === 'QF' || stage === 'SF' || stage === 'Final') return { stage, leg: leg ? Number(leg) : undefined }
  return null
}

const STAGE_TITLE: Record<string, string> = { QF: 'Quarter Finals', SF: 'Semi Finals', Final: 'Final' }

/** Υπότιτλος post Προγράμματος/Αποτελεσμάτων. */
export function roundSub(sel: { scope: 'round' | 'day'; round: string; day: string }, season: string) {
  if (sel.scope === 'day') return `${sel.day ? fmtDay(new Date(`${sel.day}T12:00:00`).toISOString()) : ''} · ${season}`.trim()
  const sr = parseStageRound(sel.round)
  return sr
    ? `Playoff · ${STAGE_TITLE[sr.stage]}${sr.leg ? ` · ${sr.leg}ο ματς` : ''} · ${season}`
    : `Αγωνιστική ${sel.round} · ${season}`
}

function baseRow(m: any): MatchRow {
  return {
    homeName: m.team_a_data?.name ?? '—', homeLogo: m.team_a_data?.logo_url ?? null,
    awayName: m.team_b_data?.name ?? '—', awayLogo: m.team_b_data?.logo_url ?? null,
  }
}

/** Πρόγραμμα / Αποτελέσματα ενός πρωταθλήματος, ανά αγωνιστική (ή φάση playoff) ή ανά ημέρα. */
export function buildRoundGroups(matches: any[], kind: 'schedule' | 'results',
  sel: { scope: 'round' | 'day'; round: string; day: string }): DayGroup[] {
  const wanted = kind === 'schedule' ? ['Scheduled', 'Live'] : ['Played', 'Forfeit']
  const legMap = buildLegMap(matches)
  const sr = parseStageRound(sel.round)
  const list = matches
    .filter(m => wanted.includes(m.match_status) && (sel.scope === 'day'
      ? (m.match_date && athensDateKey(m.match_date) === sel.day)
      : sr
        ? (m.stage === sr.stage && (sr.leg ? legMap.get(m.match_id) === sr.leg : true))
        : (!m.stage && String(m.round) === sel.round)))
    .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
    .slice(0, 6)

  const byDay = new Map<string, MatchRow[]>()
  for (const m of list) {
    const dayKey = m.match_date ? dayTitle(m.match_date) : 'Πρόγραμμα'
    const row = baseRow(m)
    const tag = playoffTag(m, legMap)
    if (tag) row.tag = tag
    if (m.field) row.field = m.field
    if (kind === 'results') row.score = `${m.goals_team_a ?? 0}-${m.goals_team_b ?? 0}`
    else row.time = fmtTime(m.match_date)
    if (!byDay.has(dayKey)) byDay.set(dayKey, [])
    byDay.get(dayKey)!.push(row)
  }
  return [...byDay.entries()].map(([day, ms]) => ({ day, matches: ms }))
}

/** Εβδομαδιαίο πρόγραμμα/αποτελέσματα (Δευτ–Κυρ) ενός ή πολλών πρωταθλημάτων. */
export function buildWeekGroups(matches: any[], weekDate: string, mode: 'program' | 'results', multi: boolean) {
  const wdays = weekDays(weekDate)
  const keys = new Set(wdays.map(w => w.key))
  const want = mode === 'results' ? ['Played', 'Forfeit'] : ['Scheduled', 'Live']
  const legMap = buildLegMap(matches)
  const byKey = new Map<string, any[]>()
  for (const m of matches) {
    if (!m.match_date) continue
    const k = athensDateKey(m.match_date)
    if (!keys.has(k) || !want.includes(m.match_status)) continue
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(m)
  }
  const groups: DayGroup[] = wdays.filter(w => byKey.has(w.key)).map(w => ({
    day: w.label,
    matches: (byKey.get(w.key) ?? [])
      .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? '') || (a.field ?? '').localeCompare(b.field ?? ''))
      .map(m => {
        const row = baseRow(m)
        if (mode === 'results') row.score = `${m.goals_team_a ?? 0}-${m.goals_team_b ?? 0}`
        else row.time = fmtTime(m.match_date)
        if (m.field) row.field = m.field
        const tag = playoffTag(m, legMap)
        if (tag) row.tag = tag
        if (multi) { row.leagueName = m.league?.name; row.leagueLogo = m.league?.logo_url ?? null }
        return row
      }),
  }))
  const dm = (key: string) => { const [, mo, da] = key.split('-'); return `${+da}/${+mo}` }
  return { groups, range: `Εβδομάδα ${dm(wdays[0].key)} – ${dm(wdays[6].key)}` }
}

/** Αποδόσεις ημέρας — όλα τα πρωταθλήματα, ομαδοποιημένα ανά πρωτάθλημα. */
export function buildOddsGroups(all: any[], day: string, odds: { match_id: string; home: any; draw: any; away: any }[]): DayGroup[] {
  const dayList = all
    .filter(m => ['Scheduled', 'Live'].includes(m.match_status) && m.match_date && athensDateKey(m.match_date) === day)
    .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
  const legMap = buildLegMap(all)
  const oMap = new Map(odds.map(o => [o.match_id, o]))
  const fmtOdd = (v: any) => (v == null ? undefined : Number(v).toFixed(2))
  const byLeague = new Map<string, { name: string; sort: number; rows: MatchRow[] }>()
  for (const m of dayList) {
    const o = oMap.get(m.match_id)
    const row: MatchRow = { ...baseRow(m), time: fmtTime(m.match_date), leagueName: m.league?.name, leagueLogo: m.league?.logo_url ?? null }
    if (m.field) row.field = m.field
    const tag = playoffTag(m, legMap); if (tag) row.tag = tag
    if (o) { row.oHome = fmtOdd(o.home); row.oDraw = fmtOdd(o.draw); row.oAway = fmtOdd(o.away) }
    if (!byLeague.has(m.league_id)) byLeague.set(m.league_id, { name: m.league?.name ?? '—', sort: m.league?.sort_order ?? 999, rows: [] })
    byLeague.get(m.league_id)!.rows.push(row)
  }
  return [...byLeague.values()].sort((a, b) => a.sort - b.sort).map(g => ({ day: g.name, matches: g.rows }))
}

/** Φόρμα 5 τελευταίων αγώνων μιας ομάδας. */
export function formOf(matches: any[], teamId: string): ('W' | 'D' | 'L')[] {
  return matches
    .filter(x => ['Played', 'Forfeit'].includes(x.match_status) && (x.team_a === teamId || x.team_b === teamId))
    .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
    .slice(-5)
    .map(x => {
      const us = x.team_a === teamId
      const gf = us ? x.goals_team_a : x.goals_team_b
      const ga = us ? x.goals_team_b : x.goals_team_a
      return gf > ga ? 'W' : gf < ga ? 'L' : 'D'
    })
}

/** Αναμέτρηση (1vs1) πριν από τον αγώνα. */
export function buildVersus(m: any, matches: any[], standings: any[]): Versus {
  const st = (teamId: string) => standings.find((s: any) => s.team_id === teamId)
  const sa = st(m.team_a), sb = st(m.team_b)
  return {
    ...baseRow(m),
    day: m.match_date ? fmtDay(m.match_date) : '',
    time: m.match_date ? fmtTime(m.match_date) : '',
    field: m.field ?? '',
    homePos: sa?.position, homePts: sa?.points, homeForm: formOf(matches, m.team_a),
    awayPos: sb?.position, awayPts: sb?.points, awayForm: formOf(matches, m.team_b),
    tag: versusStageLabel(m.stage, legOfMatch(m, matches)) ?? undefined,
  }
}

export interface MatchEvent { team_id: string; player_id: string; event_type: string; period: string; minute: number | null }

/**
 * Τελικό σκορ με σκόρερ. Το αυτογκόλ (OWN) αποθηκεύεται με την ομάδα του παίκτη που το έβαλε
 * και μετράει στην ΑΝΤΙΠΑΛΗ. Τα πέναλτι της διαδικασίας (period PEN) δεν είναι σκόρερ.
 */
export function buildFinal(m: any, events: MatchEvent[], playerName: (id: string) => string, matches: any[] = [], mvpName?: string): Final {
  const goals = events
    .filter(e => (e.event_type === 'GOAL' || e.event_type === 'OWN') && e.period !== 'PEN')
    .sort((a, b) => absMinute(a.period, a.minute) - absMinute(b.period, b.minute))
  const label = (e: MatchEvent) => `${playerName(e.player_id)} ${fmtMinute(e.period, e.minute)}${e.event_type === 'OWN' ? ' (αυτ.)' : ''}`.trim()
  const forHome = (e: MatchEvent) => (e.event_type === 'GOAL' ? e.team_id === m.team_a : e.team_id === m.team_b)
  const pens = (m.pens_team_a ?? 0) > 0 || (m.pens_team_b ?? 0) > 0 ? `${m.pens_team_a}-${m.pens_team_b}` : undefined
  const tag = m.stage ? versusStageLabel(m.stage, legOfMatch(m, matches)) ?? undefined : undefined
  return {
    ...baseRow(m),
    homeGoals: m.goals_team_a ?? 0, awayGoals: m.goals_team_b ?? 0,
    pens, forfeit: m.match_status === 'Forfeit',
    homeScorers: goals.filter(forHome).map(label),
    awayScorers: goals.filter(e => !forHome(e)).map(label),
    mvp: mvpName, day: m.match_date ? fmtDay(m.match_date) : '', field: m.field ?? '', tag,
  }
}

/** MVP αγώνα με τα γκολ/ασίστ του σε αυτόν τον αγώνα. */
export function buildMvp(m: any, player: { player_id: string; full_name: string; photo_url: string | null; team_id: string }, events: MatchEvent[]): Mvp {
  const mine = events.filter(e => e.player_id === player.player_id && e.period !== 'PEN')
  const home = player.team_id === m.team_a
  const team = home ? m.team_a_data : m.team_b_data
  return {
    name: player.full_name, photo: player.photo_url ?? null,
    teamName: team?.name ?? '', teamLogo: team?.logo_url ?? null,
    line: `${m.team_a_data?.name ?? '—'} ${m.goals_team_a ?? 0}-${m.goals_team_b ?? 0} ${m.team_b_data?.name ?? '—'}`,
    goals: mine.filter(e => e.event_type === 'GOAL').length || undefined,
    assists: mine.filter(e => e.event_type === 'ASSIST').length || undefined,
  }
}

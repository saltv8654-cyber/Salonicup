'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Select, LogoUpload } from '../ui'
import { athensDateKey, fmtDay, fmtTime } from '@/lib/time'
import toast from 'react-hot-toast'
import { drawPost, THEMES, type PostType, type PostData, type DayGroup, type MatchRow, type ThemeId } from './canvas'
import { versusStageLabel, legOfMatch, saveImageBlob } from './versus-card'

const TYPES: { id: PostType; label: string }[] = [
  { id: 'schedule',  label: 'Πρόγραμμα' },
  { id: 'results',   label: 'Αποτελέσματα' },
  { id: 'standings', label: 'Βαθμολογία' },
  { id: 'versus',    label: 'Αναμέτρηση' },
  { id: 'week',      label: 'Εβδομάδα' },
]

const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'numeric' }

const STAGE_SHORT: Record<string, string> = { QF: 'ΠΡΟΗΜ.', SF: 'ΗΜΙΤΕΛ.', Final: 'ΤΕΛΙΚΟΣ' }

/** Χάρτης match_id → αριθμός σκέλους (1/2) για διπλά playoff (QF/SF). */
function buildLegMap(list: any[]) {
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
function playoffTag(m: any, legMap: Map<string, number>): string | undefined {
  const s = STAGE_SHORT[m.stage as string]
  if (!s) return undefined
  const leg = legMap.get(m.match_id)
  const legLbl = m.stage === 'Final' ? '' : leg === 2 ? ' Β΄' : ' Α΄'
  return `PLAYOFF · ${s}${legLbl}`
}

/** Οι 7 ημέρες (Δευτ→Κυρ) της εβδομάδας που περιέχει το dateKey, ως {key, label}. */
function weekDays(dateKey: string): { key: string; label: string }[] {
  const base = new Date(`${dateKey}T12:00:00Z`)
  const dow = (base.getUTCDay() + 6) % 7 // 0=Δευτ … 6=Κυρ
  const mon = new Date(base); mon.setUTCDate(base.getUTCDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i)
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric' }),
    }
  })
}

async function ensureOswald() {
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

export default function AdminPost() {
  const supabase = createClient()
  const [load, setLoad]           = useState(true)
  const [leagues, setLeagues]     = useState<any[]>([])
  const [league, setLeague]       = useState('')
  const [type, setType]           = useState<PostType>('schedule')
  const [matches, setMatches]     = useState<any[]>([])
  const [standings, setStandings] = useState<any[]>([])
  const [round, setRound]         = useState<string>('')
  const [scope, setScope]         = useState<'round' | 'day'>('round')
  const [day, setDay]             = useState(() => athensDateKey(new Date().toISOString()))
  const [matchId, setMatchId]     = useState('')
  const [weekDate, setWeekDate]   = useState(() => athensDateKey(new Date().toISOString()))
  const [weekMode, setWeekMode]   = useState<'program' | 'results'>('program')
  const [weekLeagues, setWeekLeagues] = useState<Set<string>>(new Set())
  const [format, setFormat]       = useState<'square' | 'story' | 'yt'>('square')
  const [theme, setTheme]         = useState<ThemeId>('orange')
  const [showSponsors, setShowSponsors] = useState(true)
  const [sponsorA, setSponsorA]   = useState('')
  const [sponsorB, setSponsorB]   = useState('')

  // Λογότυπα χορηγών — τοπικά + καθολικά στη βάση (για OBS από οποιαδήποτε συσκευή)
  useEffect(() => {
    setSponsorA(localStorage.getItem('sponsorA') || '')
    setSponsorB(localStorage.getItem('sponsorB') || '')
    // Καθολικοί χορηγοί από τη βάση κερδίζουν, αν υπάρχουν
    supabase.from('app_settings').select('sponsors').eq('id', 1).maybeSingle()
      .then(({ data }: any) => {
        const sp: string[] = data?.sponsors ?? []
        if (sp[0] !== undefined) { setSponsorA(sp[0] ?? ''); localStorage.setItem('sponsorA', sp[0] ?? '') }
        if (sp[1] !== undefined) { setSponsorB(sp[1] ?? ''); localStorage.setItem('sponsorB', sp[1] ?? '') }
      })
  }, [])
  const syncSponsors = (a: string, b: string) =>
    supabase.from('app_settings').upsert({ id: 1, sponsors: [a, b].filter(Boolean), updated_at: new Date().toISOString() })
      .then(() => {}, () => {})
  const saveSponsorA = (u: string) => { setSponsorA(u); localStorage.setItem('sponsorA', u); setReady(false); syncSponsors(u, sponsorB) }
  const saveSponsorB = (u: string) => { setSponsorB(u); localStorage.setItem('sponsorB', u); setReady(false); syncSponsors(sponsorA, u) }
  const [busy, setBusy]           = useState(false)
  const [ready, setReady]         = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    supabase.from('leagues').select('*').order('sort_order').then(({ data }) => {
      setLeagues(data ?? [])
      if (data?.length) setLeague(data[0].league_id)
      setWeekLeagues(new Set((data ?? []).map((l: any) => l.league_id)))
      setLoad(false)
    })
  }, [])

  useEffect(() => {
    if (!league) return
    setReady(false)
    Promise.all([
      supabase.from('matches')
        .select('*, team_a_data:team_a(name,logo_url), team_b_data:team_b(name,logo_url)')
        .eq('league_id', league).order('match_date'),
      supabase.from('standings').select('*').eq('league_id', league).order('position'),
    ]).then(([m, s]) => {
      const list = m.data ?? []
      setMatches(list)
      setStandings(s.data ?? [])
      const rs = [...new Set(list.map((x: any) => x.round))].sort((a, b) => a - b)
      setRound(rs.length ? String(rs[rs.length - 1]) : '')
      // Προτείνει (προεπιλογή) έναν σημερινό αγώνα· αλλιώς τον πλησιέστερο επόμενο
      const tk = athensDateKey(new Date().toISOString())
      const dated = list.filter((x: any) => x.match_date)
      const today = dated.filter((x: any) => athensDateKey(x.match_date) === tk)
        .sort((a: any, b: any) => a.match_date.localeCompare(b.match_date))
      const next = dated.filter((x: any) => athensDateKey(x.match_date) > tk)
        .sort((a: any, b: any) => a.match_date.localeCompare(b.match_date))
      setMatchId(today[0]?.match_id ?? next[0]?.match_id ?? '')
    })
  }, [league])

  // Επιλογές «Ανά αγωνιστική»: κανονικές αγωνιστικές + playoff φάσεις (ανά σκέλος)
  const STAGE_NAME: Record<string, string> = { QF: 'Quarter finals', SF: 'Semi finals', Final: 'Final' }
  const roundOptions = useMemo(() => {
    const nums = [...new Set(matches.filter(m => !m.stage).map(m => m.round))]
      .sort((a, b) => a - b)
      .map(r => ({ value: String(r), label: `Αγωνιστική ${r}` }))
    const out: { value: string; label: string }[] = [...nums]
    for (const s of ['QF', 'SF'] as const) {
      if (!matches.some(m => m.stage === s)) continue
      out.push({ value: `${s}:1`, label: `🏆 Playoff · ${STAGE_NAME[s]} · 1ο ματς` })
      out.push({ value: `${s}:2`, label: `🏆 Playoff · ${STAGE_NAME[s]} · 2ο ματς` })
    }
    if (matches.some(m => m.stage === 'Final')) {
      out.push({ value: 'Final', label: '🏆 Playoff · Final' })
    }
    return out
  }, [matches])
  const parseStageRound = (r: string): { stage: string; leg?: number } | null => {
    const [stage, leg] = (r || '').split(':')
    if (stage === 'QF' || stage === 'SF' || stage === 'Final') return { stage, leg: leg ? Number(leg) : undefined }
    return null
  }
  const leagueObj = leagues.find(l => l.league_id === league)

  function buildGroups(kind: 'schedule' | 'results'): DayGroup[] {
    const wanted = kind === 'schedule'
      ? ['Scheduled', 'Live']
      : ['Played', 'Forfeit']
    const legMap = buildLegMap(matches)
    const sr = parseStageRound(round)
    const list = matches
      .filter(m => wanted.includes(m.match_status) && (scope === 'day'
        ? (m.match_date && athensDateKey(m.match_date) === day)
        : sr
          ? (m.stage === sr.stage && (sr.leg ? legMap.get(m.match_id) === sr.leg : true))
          : (!m.stage && String(m.round) === round)))
      .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
      .slice(0, 6)

    const byDay = new Map<string, MatchRow[]>()
    for (const m of list) {
      const d = m.match_date ? new Date(m.match_date) : null
      const dayKey = d ? d.toLocaleDateString('el-GR', DAY_FMT) : 'Πρόγραμμα'
      const row: MatchRow = {
        homeName: m.team_a_data?.name ?? '—',
        homeLogo: m.team_a_data?.logo_url ?? null,
        awayName: m.team_b_data?.name ?? '—',
        awayLogo: m.team_b_data?.logo_url ?? null,
      }
      const tag = playoffTag(m, legMap)
      if (tag) row.tag = tag
      if (m.field) row.field = m.field
      if (kind === 'results') {
        row.score = `${m.goals_team_a ?? 0}-${m.goals_team_b ?? 0}`
      } else {
        row.time = d ? d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : ''
      }
      if (!byDay.has(dayKey)) byDay.set(dayKey, [])
      byDay.get(dayKey)!.push(row)
    }
    return [...byDay.entries()].map(([day, ms]) => ({ day, matches: ms }))
  }

  async function generate() {
    if (!leagueObj || !canvasRef.current) return
    setBusy(true)
    try {
      await ensureOswald()
      const typeLabel = TYPES.find(t => t.id === type)!.label
      const season = leagueObj.season ?? ''
      const dayLabel = day ? fmtDay(new Date(`${day}T12:00:00`).toISOString()) : ''

      // Εβδομαδιαίο πρόγραμμα/αποτελέσματα (ίδιο στυλ με το Πρόγραμμα, με λογότυπα)
      if (type === 'week') {
        if (!weekLeagues.size) { toast.error('Διάλεξε πρωταθλήματα'); setBusy(false); return }
        const selIds = [...weekLeagues]
        const selLeagues = leagues.filter(l => selIds.includes(l.league_id))
        const multi = selLeagues.length > 1
        const wdays = weekDays(weekDate)
        const keys = new Set(wdays.map(w => w.key))
        const want = weekMode === 'results' ? ['Played', 'Forfeit'] : ['Scheduled', 'Live']
        const { data: wm } = await supabase.from('matches')
          .select('*, team_a_data:team_a(name,logo_url), team_b_data:team_b(name,logo_url), league:league_id(name,logo_url)')
          .in('league_id', selIds)
          .not('match_date', 'is', null)
        const wLegMap = buildLegMap(wm ?? [])
        const byKey = new Map<string, any[]>()
        for (const m of wm ?? []) {
          const k = athensDateKey(m.match_date)
          if (!keys.has(k) || !want.includes(m.match_status)) continue
          if (!byKey.has(k)) byKey.set(k, [])
          byKey.get(k)!.push(m)
        }
        const groups: DayGroup[] = wdays.filter(w => byKey.has(w.key)).map(w => ({
          day: w.label,
          matches: (byKey.get(w.key) ?? [])
            .sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? '')
              || (a.field ?? '').localeCompare(b.field ?? ''))
            .map(m => {
              const row: MatchRow = {
                homeName: m.team_a_data?.name ?? '—', homeLogo: m.team_a_data?.logo_url ?? null,
                awayName: m.team_b_data?.name ?? '—', awayLogo: m.team_b_data?.logo_url ?? null,
              }
              if (weekMode === 'results') row.score = `${m.goals_team_a ?? 0}-${m.goals_team_b ?? 0}`
              else row.time = fmtTime(m.match_date)
              if (m.field) row.field = m.field
              const wtag = playoffTag(m, wLegMap)
              if (wtag) row.tag = wtag
              if (multi) { row.leagueName = m.league?.name; row.leagueLogo = m.league?.logo_url ?? null }
              return row
            }),
        }))
        const dm = (key: string) => { const [, mo, da] = key.split('-'); return `${+da}/${+mo}` }
        const range = `Εβδομάδα ${dm(wdays[0].key)} – ${dm(wdays[6].key)}`
        const one = selLeagues[0]
        const weekPost: PostData = {
          type: 'week',
          leagueName: multi ? 'Πρόγραμμα Εβδομάδας' : (one?.name ?? 'Εβδομάδα'),
          sub: multi ? range : `${range}${one?.season ? ' · ' + one.season : ''}`,
          typeLabel: weekMode === 'results' ? 'Αποτελέσματα' : 'Πρόγραμμα',
          leagueLogo: multi ? null : (one?.logo_url ?? null),
          groups, standings: [],
          sponsors: showSponsors ? [sponsorA, sponsorB].filter(Boolean) : [],
          theme,
        }
        await drawPost(canvasRef.current, weekPost, { w: size.w, h: size.h })
        setReady(true)
        toast.success('Έτοιμο! Κατέβασέ το.')
        return
      }

      // Αναμέτρηση (1vs1)
      let versus: PostData['versus']
      if (type === 'versus') {
        const m = matches.find(x => x.match_id === matchId)
        if (!m) { toast.error('Διάλεξε αγώνα'); setBusy(false); return }
        const dt = m.match_date ? new Date(m.match_date) : null

        const formOf = (teamId: string): ('W' | 'D' | 'L')[] =>
          matches
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

        versus = {
          homeName: m.team_a_data?.name ?? '—', homeLogo: m.team_a_data?.logo_url ?? null,
          awayName: m.team_b_data?.name ?? '—', awayLogo: m.team_b_data?.logo_url ?? null,
          day: dt ? fmtDay(m.match_date) : '',
          time: dt ? dt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '',
          field: m.field ?? '',
          homePos: sa?.position, homePts: sa?.points, homeForm: formOf(m.team_a),
          awayPos: sb?.position, awayPts: sb?.points, awayForm: formOf(m.team_b),
          tag: versusStageLabel(m.stage, legOfMatch(m, matches)) ?? undefined,
        }
      }

      const srTitle = parseStageRound(round)
      const stageTitleName: Record<string, string> = { QF: 'Quarter Finals', SF: 'Semi Finals', Final: 'Final' }
      const sub = type === 'standings' || type === 'versus'
        ? season
        : scope === 'day'
        ? `${dayLabel} · ${season}`.trim()
        : srTitle
        ? `Playoff · ${stageTitleName[srTitle.stage]}${srTitle.leg ? ` · ${srTitle.leg}ο ματς` : ''} · ${season}`
        : `Αγωνιστική ${round} · ${season}`

      const data: PostData = {
        type,
        leagueName: leagueObj.name,
        sub,
        typeLabel,
        leagueLogo: leagueObj.logo_url ?? null,
        groups: (type === 'schedule' || type === 'results') ? buildGroups(type) : [],
        standings: type === 'standings'
          ? standings.slice(0, 10).map((t: any) => ({
              position: t.position, name: t.team_name, logo: t.logo_url,
              played: t.played, wins: t.wins, draws: t.draws, losses: t.losses,
              gd: t.goal_diff, points: t.points,
            }))
          : [],
        versus,
        sponsors: showSponsors ? [sponsorA, sponsorB].filter(Boolean) : [],
        theme,
      }
      await drawPost(canvasRef.current, data, type === 'versus' ? { w: size.w, h: size.h } : undefined)
      setReady(true)
      toast.success('Έτοιμο! Κατέβασέ το.')
    } catch (e: any) {
      toast.error('Σφάλμα δημιουργίας')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(async (blob) => {
      if (!blob) return toast.error('Δεν κατέβηκε')
      const res = await saveImageBlob(blob, `salonicup-${type}-${Date.now()}.png`)
      if (res === 'shared') toast.success('Αποθήκευσέ το στις Φωτογραφίες')
      else if (res === 'downloaded') toast.success('Κατέβηκε')
    }, 'image/png')
  }

  if (load) return <Loading />

  const SIZES = {
    square: { w: 1080, h: 1080, label: 'Τετράγωνο' },
    story:  { w: 1080, h: 1920, label: 'Story' },
    yt:     { w: 1920, h: 1080, label: 'YouTube' },
  } as const
  const size = SIZES[format]
  const needsRound = type === 'schedule' || type === 'results'
  // Σειρά αγώνων: Σήμερα πρώτα, μετά προηγούμενα (πιο πρόσφατα ψηλά), μετά επόμενα.
  const matchOptions = (() => {
    const tk = athensDateKey(new Date().toISOString())
    const dated = matches.filter((m: any) => m.match_date)
    const undated = matches.filter((m: any) => !m.match_date)
    const today = dated.filter((m: any) => athensDateKey(m.match_date) === tk)
      .sort((a: any, b: any) => a.match_date.localeCompare(b.match_date))
    const past = dated.filter((m: any) => athensDateKey(m.match_date) < tk)
      .sort((a: any, b: any) => b.match_date.localeCompare(a.match_date))  // πιο πρόσφατα πρώτα
    const future = dated.filter((m: any) => athensDateKey(m.match_date) > tk)
      .sort((a: any, b: any) => a.match_date.localeCompare(b.match_date))
    const mk = (m: any, tag: string) => ({
      value: m.match_id,
      label: `${m.team_a_data?.name ?? '—'} – ${m.team_b_data?.name ?? '—'} · ${tag}`,
    })
    return [
      ...today.map((m: any) => mk(m, 'Σήμερα')),
      ...past.map((m: any) => mk(m, fmtDay(m.match_date))),
      ...future.map((m: any) => mk(m, fmtDay(m.match_date))),
      ...undated.map((m: any) => ({ value: m.match_id, label: `${m.team_a_data?.name ?? '—'} – ${m.team_b_data?.name ?? '—'}` })),
    ]
  })()

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-4">Δημιουργία Post</h1>

      <div className="flex flex-col gap-3 mb-4">
        {type !== 'week' && (
          <Select label="ΠΡΩΤΑΘΛΗΜΑ" value={league} onChange={setLeague}
            options={leagues.map(l => ({ value: l.league_id, label: l.name }))} />
        )}

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΤΥΠΟΣ</label>
          <div className="grid grid-cols-3 gap-[3px] bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
            {TYPES.map(t => (
              <button key={t.id}
                onClick={() => { setType(t.id); setReady(false); if (t.id === 'week') setFormat('story') }}
                className={`py-2.5 rounded-lg text-[12px] font-bold transition-colors
                  ${type === t.id ? 'bg-brand text-chalk' : 'text-dim'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {needsRound && (
          <>
            <div>
              <label className="block text-[8.5px] font-extrabold text-dim
                tracking-[0.12em] mb-1.5 pl-0.5">ΕΥΡΟΣ</label>
              <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
                {(['round', 'day'] as const).map(s => (
                  <button key={s} onClick={() => { setScope(s); setReady(false) }}
                    className={`flex-1 py-2.5 rounded-lg text-[12.5px] font-bold transition-colors
                      ${scope === s ? 'bg-brand text-chalk' : 'text-dim'}`}>
                    {s === 'round' ? 'Ανά αγωνιστική' : 'Ανά ημέρα'}
                  </button>
                ))}
              </div>
            </div>

            {scope === 'round' ? (
              <Select label="ΑΓΩΝΙΣΤΙΚΗ / ΦΑΣΗ" value={round} onChange={setRound}
                options={roundOptions} />
            ) : (
              <div>
                <label className="block text-[8.5px] font-extrabold text-dim
                  tracking-[0.12em] mb-1.5 pl-0.5">ΗΜΕΡΑ</label>
                <input type="date" value={day} onChange={e => { setDay(e.target.value); setReady(false) }}
                  className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
                    outline-none border border-chalk/[0.07] focus:border-lit/50" />
              </div>
            )}
          </>
        )}

        {/* ΘΕΜΑ — για όλους τους τύπους */}
        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΘΕΜΑ</label>
          <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
            {(Object.keys(THEMES) as ThemeId[]).map(id => (
              <button key={id} onClick={() => { setTheme(id); setReady(false) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg
                  text-[12px] font-bold transition-colors
                  ${theme === id ? 'bg-brand text-chalk' : 'text-dim'}`}>
                <span className="w-3 h-3 rounded-full inline-block"
                  style={{ background: THEMES[id].accent }} />
                {THEMES[id].label}
              </button>
            ))}
          </div>
        </div>

        {type === 'versus' && (
          <>
            <Select label="ΑΓΩΝΑΣ" value={matchId} onChange={setMatchId}
              options={matchOptions} />
            <div>
              <label className="block text-[8.5px] font-extrabold text-dim
                tracking-[0.12em] mb-1.5 pl-0.5">ΜΕΓΕΘΟΣ</label>
              <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
                {(['square', 'story', 'yt'] as const).map(f => (
                  <button key={f} onClick={() => { setFormat(f); setReady(false) }}
                    className={`flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-colors
                      ${format === f ? 'bg-brand text-chalk' : 'text-dim'}`}>
                    {SIZES[f].label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {type === 'week' && (
          <>
            {/* Πρόγραμμα ή Αποτελέσματα */}
            <div>
              <label className="block text-[8.5px] font-extrabold text-dim
                tracking-[0.12em] mb-1.5 pl-0.5">ΤΙ ΝΑ ΔΕΙΞΕΙ</label>
              <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
                {([['program', 'Πρόγραμμα'], ['results', 'Αποτελέσματα']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => { setWeekMode(v); setReady(false) }}
                    className={`flex-1 py-2.5 rounded-lg text-[12.5px] font-bold transition-colors
                      ${weekMode === v ? 'bg-brand text-chalk' : 'text-dim'}`}>{l}</button>
                ))}
              </div>
            </div>

            {/* Εβδομάδα (οποιαδήποτε μέρα της) */}
            <div>
              <label className="block text-[8.5px] font-extrabold text-dim
                tracking-[0.12em] mb-1.5 pl-0.5">ΕΒΔΟΜΑΔΑ</label>
              <input type="date" value={weekDate} onChange={e => { setWeekDate(e.target.value); setReady(false) }}
                className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
                  outline-none border border-chalk/[0.07] focus:border-lit/50" />
              <p className="text-[10px] text-dim mt-1 pl-0.5">
                {(() => { const w = weekDays(weekDate); return `Δευτέρα – Κυριακή (${w[0].label.split(' ').pop()}–${w[6].label.split(' ').pop()})` })()}
              </p>
            </div>

            {/* Πρωταθλήματα (πολλαπλή επιλογή) */}
            <div>
              <div className="flex items-center justify-between mb-1.5 pl-0.5">
                <label className="text-[8.5px] font-extrabold text-dim tracking-[0.12em]">ΠΡΩΤΑΘΛΗΜΑΤΑ</label>
                <div className="flex gap-2">
                  <button onClick={() => { setWeekLeagues(new Set(leagues.map(l => l.league_id))); setReady(false) }}
                    className="text-[10px] font-bold text-lit">Όλα</button>
                  <button onClick={() => { setWeekLeagues(new Set()); setReady(false) }}
                    className="text-[10px] font-bold text-dim">Κανένα</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {leagues.map(l => {
                  const on = weekLeagues.has(l.league_id)
                  return (
                    <button key={l.league_id}
                      onClick={() => { setWeekLeagues(prev => { const n = new Set(prev); n.has(l.league_id) ? n.delete(l.league_id) : n.add(l.league_id); return n }); setReady(false) }}
                      className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold border transition-colors
                        ${on ? 'bg-lit/15 border-lit/50 text-lit' : 'bg-turf border-chalk/[0.07] text-dim'}`}>
                      {on ? '✓ ' : ''}{l.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Μέγεθος */}
            <div>
              <label className="block text-[8.5px] font-extrabold text-dim
                tracking-[0.12em] mb-1.5 pl-0.5">ΜΕΓΕΘΟΣ</label>
              <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
                {(['story', 'square', 'yt'] as const).map(f => (
                  <button key={f} onClick={() => { setFormat(f); setReady(false) }}
                    className={`flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-colors
                      ${format === f ? 'bg-brand text-chalk' : 'text-dim'}`}>
                    {SIZES[f].label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Χορηγοί — για όλους τους τύπους */}
        <div className="rounded-xl border border-chalk/[0.06] p-3 bg-turf/40">
          <label className="flex items-center justify-between mb-2">
            <span className="text-[8.5px] font-extrabold text-dim tracking-[0.12em]">
              ΧΟΡΗΓΟΙ (POWERED BY)
            </span>
            <button type="button" onClick={() => { setShowSponsors(v => !v); setReady(false) }}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border
                ${showSponsors ? 'text-lit border-lit/40 bg-lit/10' : 'text-dim border-chalk/[0.1]'}`}>
              {showSponsors ? 'Ενεργοί' : 'Ανενεργοί'}
            </button>
          </label>
          <p className="text-[10.5px] text-dim mb-2 leading-snug">
            Ανέβασε τα λογότυπα μία φορά — αποθηκεύονται σε αυτή τη συσκευή και μπαίνουν σε όλα τα γραφικά.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <LogoUpload bucket="logos" url={sponsorA} onChange={saveSponsorA}
              fallback="🅰️" label="ΧΟΡΗΓΟΣ 1" />
            <LogoUpload bucket="logos" url={sponsorB} onChange={saveSponsorB}
              fallback="🅱️" label="ΧΟΡΗΓΟΣ 2" />
          </div>
        </div>
      </div>

      <button onClick={generate}
        disabled={busy || !league
          || (needsRound && (scope === 'round' ? !round : !day))
          || (type === 'versus' && !matchId)
          || (type === 'week' && weekLeagues.size === 0)}
        className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
          text-white font-extrabold text-[15px] disabled:opacity-40
          shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
        {busy ? 'Δημιουργία…' : 'Δημιουργία'}
      </button>

      {/* Preview */}
      <div className="mt-5">
        <canvas ref={canvasRef}
          className={`w-full rounded-2xl border border-chalk/[0.08] ${ready ? 'block' : 'hidden'}`}
          style={{ aspectRatio: (type === 'versus' || type === 'week') ? `${size.w} / ${size.h}` : '1 / 1' }} />
        {ready && (
          <button onClick={download}
            className="w-full mt-3 py-3.5 rounded-xl bg-chalk/[0.06] text-chalk
              font-extrabold text-[14px] border border-chalk/[0.08]">
            ⬇︎ Αποθήκευση εικόνας ({(type === 'versus' || type === 'week') ? `${size.w}×${size.h}` : '1080×1080'})
          </button>
        )}
        {!ready && (
          <p className="text-dim text-[12.5px] text-center py-10">
            Διάλεξε πρωτάθλημα, τύπο{needsRound ? ' και αγωνιστική' : ''} και πάτα «Δημιουργία».
          </p>
        )}
      </div>
    </div>
  )
}

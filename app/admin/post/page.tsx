'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Select, LogoUpload } from '../ui'
import { athensDateKey, fmtDay } from '@/lib/time'
import toast from 'react-hot-toast'
import { drawPost, THEMES, type PostType, type PostData, type ThemeId } from './canvas'
import { saveImageBlob, themeForLeague } from './versus-card'
import { buildRoundGroups, buildWeekGroups, buildOddsGroups, buildVersus, buildFinal, buildMvp, matchSub, roundSub, weekDays } from './build'

const TYPES: { id: PostType; label: string }[] = [
  { id: 'schedule',  label: 'Πρόγραμμα' },
  { id: 'results',   label: 'Αποτελέσματα' },
  { id: 'standings', label: 'Βαθμολογία' },
  { id: 'versus',    label: 'Αναμέτρηση' },
  { id: 'week',      label: 'Εβδομάδα' },
  { id: 'odds',      label: 'Αποδόσεις' },
  { id: 'final',     label: 'Τελικό' },
  { id: 'mvp',       label: 'MVP' },
]

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
  const [theme, setTheme]         = useState<ThemeId>('liga')
  const [showSponsors, setShowSponsors] = useState(true)
  const [sponsorA, setSponsorA]   = useState('')
  const [sponsorB, setSponsorB]   = useState('')
  const [sponsorC, setSponsorC]   = useState('')
  const [sponsorD, setSponsorD]   = useState('')

  // Λογότυπα χορηγών — τοπικά + καθολικά στη βάση (για OBS από οποιαδήποτε συσκευή)
  useEffect(() => {
    setSponsorA(localStorage.getItem('sponsorA') || '')
    setSponsorB(localStorage.getItem('sponsorB') || '')
    setSponsorC(localStorage.getItem('sponsorC') || '')
    setSponsorD(localStorage.getItem('sponsorD') || '')
    // Καθολικοί χορηγοί από τη βάση κερδίζουν, αν υπάρχουν
    supabase.from('app_settings').select('sponsors').eq('id', 1).maybeSingle()
      .then(({ data }: any) => {
        const sp: string[] = data?.sponsors ?? []
        const set = [setSponsorA, setSponsorB, setSponsorC, setSponsorD]
        const keys = ['sponsorA', 'sponsorB', 'sponsorC', 'sponsorD']
        for (let i = 0; i < 4; i++) if (sp[i] !== undefined) { set[i](sp[i] ?? ''); localStorage.setItem(keys[i], sp[i] ?? '') }
      })
  }, [])
  const syncSponsors = (a: string, b: string, c: string, d: string) =>
    supabase.from('app_settings').upsert({ id: 1, sponsors: [a, b, c, d].filter(Boolean), updated_at: new Date().toISOString() })
      .then(() => {}, () => {})
  const saveSponsorA = (u: string) => { setSponsorA(u); localStorage.setItem('sponsorA', u); setReady(false); syncSponsors(u, sponsorB, sponsorC, sponsorD) }
  const saveSponsorB = (u: string) => { setSponsorB(u); localStorage.setItem('sponsorB', u); setReady(false); syncSponsors(sponsorA, u, sponsorC, sponsorD) }
  const saveSponsorC = (u: string) => { setSponsorC(u); localStorage.setItem('sponsorC', u); setReady(false); syncSponsors(sponsorA, sponsorB, u, sponsorD) }
  const saveSponsorD = (u: string) => { setSponsorD(u); localStorage.setItem('sponsorD', u); setReady(false); syncSponsors(sponsorA, sponsorB, sponsorC, u) }
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

  // Προεπιλογή θέματος ανά πρωτάθλημα (Liga→χρυσό, Master→πράσινο, κ.λπ.)
  useEffect(() => {
    const lg = leagues.find(l => l.league_id === league)
    if (lg) setTheme(themeForLeague(lg.name))
  }, [league, leagues])

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
  const leagueObj = leagues.find(l => l.league_id === league)

  const buildGroups = (kind: 'schedule' | 'results') => buildRoundGroups(matches, kind, { scope, round, day })

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
        const { data: wm } = await supabase.from('matches')
          .select('*, team_a_data:team_a(name,logo_url), team_b_data:team_b(name,logo_url), league:league_id(name,logo_url)')
          .in('league_id', selIds)
          .not('match_date', 'is', null)
        const { groups, range } = buildWeekGroups(wm ?? [], weekDate, weekMode, multi)
        const one = selLeagues[0]
        const weekPost: PostData = {
          type: 'week',
          leagueName: multi ? 'Πρόγραμμα Εβδομάδας' : (one?.name ?? 'Εβδομάδα'),
          sub: multi ? range : `${range}${one?.season ? ' · ' + one.season : ''}`,
          typeLabel: weekMode === 'results' ? 'Αποτελέσματα' : 'Πρόγραμμα',
          leagueLogo: multi ? null : (one?.logo_url ?? null),
          groups, standings: [],
          sponsors: showSponsors ? [sponsorA, sponsorB, sponsorC, sponsorD].filter(Boolean) : [],
          theme,
        }
        await drawPost(canvasRef.current, weekPost, { w: size.w, h: size.h })
        setReady(true)
        toast.success('Έτοιμο! Κατέβασέ το.')
        return
      }

      // Αποδόσεις ημέρας — ΟΛΑ τα πρωταθλήματα μαζί, ομαδοποιημένα ανά πρωτάθλημα
      if (type === 'odds') {
        const { data: dm } = await supabase.from('matches')
          .select('*, team_a_data:team_a(name,logo_url), team_b_data:team_b(name,logo_url), league:league_id(name,logo_url,sort_order)')
          .not('match_date', 'is', null)
        const all = dm ?? []
        const dayIds = all
          .filter((m: any) => ['Scheduled', 'Live'].includes(m.match_status) && athensDateKey(m.match_date) === day)
          .map((m: any) => m.match_id)
        if (!dayIds.length) { toast.error('Δεν υπάρχουν αγώνες αυτή την ημέρα'); setBusy(false); return }
        const { data: od } = await supabase.from('bet_odds')
          .select('match_id,home,draw,away').in('match_id', dayIds)
        const groups = buildOddsGroups(all, day, od ?? [])

        const oddsPost: PostData = {
          type: 'odds',
          leagueName: 'SALONICUP BET',
          sub: dayLabel,
          typeLabel: 'Αποδόσεις',
          leagueLogo: null,
          groups, standings: [],
          sponsors: showSponsors ? [sponsorA, sponsorB, sponsorC, sponsorD].filter(Boolean) : [],
          theme,
        }
        await drawPost(canvasRef.current, oddsPost, { w: size.w, h: size.h })
        setReady(true)
        toast.success('Έτοιμο! Κατέβασέ το.')
        return
      }

      // Τελικό σκορ / MVP ενός αγώνα που έληξε (ίδια σχέδια με τον Social Agent)
      if (type === 'final' || type === 'mvp') {
        const m = matches.find(x => x.match_id === matchId)
        if (!m) { toast.error('Διάλεξε αγώνα'); setBusy(false); return }
        if (!['Played', 'Forfeit'].includes(m.match_status)) { toast.error('Ο αγώνας δεν έχει ολοκληρωθεί'); setBusy(false); return }
        const { data: ev } = await supabase.from('events')
          .select('team_id,player_id,event_type,period,minute').eq('match_id', m.match_id)
        const events = (ev ?? []) as any[]
        const ids = [...new Set([...events.map(e => e.player_id), m.mvp_player_id].filter(Boolean))]
        const { data: pl } = ids.length
          ? await supabase.from('players').select('player_id,full_name,photo_url,team_id').in('player_id', ids)
          : { data: [] as any[] }
        const pm = new Map((pl ?? []).map((p: any) => [p.player_id, p]))
        const mvp: any = m.mvp_player_id ? pm.get(m.mvp_player_id) : null
        if (type === 'mvp' && !mvp) { toast.error('Δεν έχει οριστεί MVP για αυτόν τον αγώνα'); setBusy(false); return }
        const post: PostData = {
          type, leagueName: leagueObj.name, sub: matchSub(m, season), typeLabel,
          leagueLogo: leagueObj.logo_url ?? null, groups: [], standings: [],
          ...(type === 'mvp'
            ? { mvp: buildMvp(m, mvp, events) }
            : { final: buildFinal(m, events, (id: string) => (pm.get(id) as any)?.full_name ?? '?', matches, mvp?.full_name) }),
          sponsors: showSponsors ? [sponsorA, sponsorB, sponsorC, sponsorD].filter(Boolean) : [],
          theme,
        }
        await drawPost(canvasRef.current, post, { w: size.w, h: size.h })
        setReady(true)
        toast.success('Έτοιμο! Κατέβασέ το.')
        return
      }

      // Αναμέτρηση (1vs1)
      let versus: PostData['versus']
      if (type === 'versus') {
        const m = matches.find(x => x.match_id === matchId)
        if (!m) { toast.error('Διάλεξε αγώνα'); setBusy(false); return }
        versus = buildVersus(m, matches, standings)
      }

      const sub = type === 'standings' || type === 'versus' ? season : roundSub({ scope, round, day }, season)

      const data: PostData = {
        type,
        leagueName: leagueObj.name,
        sub,
        typeLabel,
        leagueLogo: leagueObj.logo_url ?? null,
        groups: (type === 'schedule' || type === 'results') ? buildGroups(type) : [],
        standings: type === 'standings'
          ? standings.slice(0, 16).map((t: any) => ({
              position: t.position, name: t.team_name, logo: t.logo_url,
              played: t.played, wins: t.wins, draws: t.draws, losses: t.losses,
              gd: t.goal_diff, points: t.points,
            }))
          : [],
        versus,
        sponsors: showSponsors ? [sponsorA, sponsorB, sponsorC, sponsorD].filter(Boolean) : [],
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
  const perMatch = type === 'versus' || type === 'final' || type === 'mvp'
  const sized = perMatch || type === 'week' || type === 'odds'
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
                onClick={() => { setType(t.id); setReady(false); if (t.id === 'week' || t.id === 'odds') setFormat('story'); if (t.id === 'final' || t.id === 'mvp') setMatchId('') }}
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

        {perMatch && (
          <>
            <Select label="ΑΓΩΝΑΣ" value={matchId} onChange={setMatchId}
              options={type === 'versus' ? matchOptions : matchOptions.filter(o => {
                const m = matches.find((x: any) => x.match_id === o.value)
                return m && ['Played', 'Forfeit'].includes(m.match_status) && (type !== 'mvp' || m.mvp_player_id)
              })} />
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

        {type === 'odds' && (
          <>
            <div>
              <label className="block text-[8.5px] font-extrabold text-dim
                tracking-[0.12em] mb-1.5 pl-0.5">ΗΜΕΡΑ</label>
              <input type="date" value={day} onChange={e => { setDay(e.target.value); setReady(false) }}
                className="w-full bg-chalk/[0.04] rounded-xl px-3.5 py-3 text-chalk text-sm
                  outline-none border border-chalk/[0.07] focus:border-lit/50" />
              <p className="text-[10px] text-dim mt-1 pl-0.5">
                Οι αγώνες της ημέρας με τις αποδόσεις 1/Χ/2 (όπως δημοσιεύτηκαν στο Bet).
              </p>
            </div>
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
            <LogoUpload bucket="logos" url={sponsorC} onChange={saveSponsorC}
              fallback="🇨" label="ΧΟΡΗΓΟΣ 3" />
            <LogoUpload bucket="logos" url={sponsorD} onChange={saveSponsorD}
              fallback="🇩" label="ΧΟΡΗΓΟΣ 4" />
          </div>
        </div>
      </div>

      <button onClick={generate}
        disabled={busy || !league
          || (needsRound && (scope === 'round' ? !round : !day))
          || (perMatch && !matchId)
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
          style={{ aspectRatio: sized ? `${size.w} / ${size.h}` : '1 / 1' }} />
        {ready && (
          <button onClick={download}
            className="w-full mt-3 py-3.5 rounded-xl bg-chalk/[0.06] text-chalk
              font-extrabold text-[14px] border border-chalk/[0.08]">
            ⬇︎ Αποθήκευση εικόνας ({sized ? `${size.w}×${size.h}` : '1080×1080'})
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

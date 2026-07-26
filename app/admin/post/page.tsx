'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loading } from '@/app/ui'
import { Select, LogoUpload } from '../ui'
import { athensDateKey, fmtDay } from '@/lib/time'
import toast from 'react-hot-toast'
import { drawPost, THEMES, type PostType, type PostData, type DayGroup, type MatchRow, type ThemeId } from './canvas'

const TYPES: { id: PostType; label: string }[] = [
  { id: 'schedule',  label: 'Πρόγραμμα' },
  { id: 'results',   label: 'Αποτελέσματα' },
  { id: 'standings', label: 'Βαθμολογία' },
  { id: 'versus',    label: 'Αναμέτρηση' },
]

const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'numeric' }

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
  const [format, setFormat]       = useState<'square' | 'story' | 'yt'>('square')
  const [theme, setTheme]         = useState<ThemeId>('orange')
  const [showSponsors, setShowSponsors] = useState(true)
  const [sponsorA, setSponsorA]   = useState('')
  const [sponsorB, setSponsorB]   = useState('')

  // Λογότυπα χορηγών — αποθηκεύονται τοπικά ανά συσκευή
  useEffect(() => {
    setSponsorA(localStorage.getItem('sponsorA') || '')
    setSponsorB(localStorage.getItem('sponsorB') || '')
  }, [])
  const saveSponsorA = (u: string) => { setSponsorA(u); localStorage.setItem('sponsorA', u); setReady(false) }
  const saveSponsorB = (u: string) => { setSponsorB(u); localStorage.setItem('sponsorB', u); setReady(false) }
  const [busy, setBusy]           = useState(false)
  const [ready, setReady]         = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    supabase.from('leagues').select('*').order('sort_order').then(({ data }) => {
      setLeagues(data ?? [])
      if (data?.length) setLeague(data[0].league_id)
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
      setMatches(m.data ?? [])
      setStandings(s.data ?? [])
      const rs = [...new Set((m.data ?? []).map((x: any) => x.round))].sort((a, b) => a - b)
      setRound(rs.length ? String(rs[rs.length - 1]) : '')
    })
  }, [league])

  const rounds = useMemo(
    () => [...new Set(matches.map(m => m.round))].sort((a, b) => a - b),
    [matches]
  )
  const leagueObj = leagues.find(l => l.league_id === league)

  function buildGroups(kind: 'schedule' | 'results'): DayGroup[] {
    const wanted = kind === 'schedule'
      ? ['Scheduled', 'Live']
      : ['Played', 'Forfeit']
    const list = matches
      .filter(m => wanted.includes(m.match_status) && (scope === 'day'
        ? (m.match_date && athensDateKey(m.match_date) === day)
        : String(m.round) === round))
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
        }
      }

      const sub = type === 'standings' || type === 'versus'
        ? season
        : scope === 'day'
        ? `${dayLabel} · ${season}`.trim()
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
    canvas.toBlob((blob) => {
      if (!blob) return toast.error('Δεν κατέβηκε')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `salonicup-${type}-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
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
  const matchOptions = matches.map((m: any) => ({
    value: m.match_id,
    label: `${m.team_a_data?.name ?? '—'} – ${m.team_b_data?.name ?? '—'}${m.match_date ? ' · ' + fmtDay(m.match_date) : ''}`,
  }))

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-4">Δημιουργία Post</h1>

      <div className="flex flex-col gap-3 mb-4">
        <Select label="ΠΡΩΤΑΘΛΗΜΑ" value={league} onChange={setLeague}
          options={leagues.map(l => ({ value: l.league_id, label: l.name }))} />

        <div>
          <label className="block text-[8.5px] font-extrabold text-dim
            tracking-[0.12em] mb-1.5 pl-0.5">ΤΥΠΟΣ</label>
          <div className="grid grid-cols-2 gap-[3px] bg-turf rounded-xl p-[3px] border border-chalk/[0.05]">
            {TYPES.map(t => (
              <button key={t.id} onClick={() => { setType(t.id); setReady(false) }}
                className={`py-2.5 rounded-lg text-[12.5px] font-bold transition-colors
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
              <Select label="ΑΓΩΝΙΣΤΙΚΗ" value={round} onChange={setRound}
                options={rounds.map(r => ({ value: String(r), label: `Αγωνιστική ${r}` }))} />
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
          || (type === 'versus' && !matchId)}
        className="w-full py-3.5 rounded-xl bg-gradient-to-b from-lit to-brand
          text-white font-extrabold text-[15px] disabled:opacity-40
          shadow-[0_4px_16px_rgba(224,91,31,0.3)]">
        {busy ? 'Δημιουργία…' : 'Δημιουργία'}
      </button>

      {/* Preview */}
      <div className="mt-5">
        <canvas ref={canvasRef}
          className={`w-full rounded-2xl border border-chalk/[0.08] ${ready ? 'block' : 'hidden'}`}
          style={{ aspectRatio: type === 'versus' ? `${size.w} / ${size.h}` : '1 / 1' }} />
        {ready && (
          <button onClick={download}
            className="w-full mt-3 py-3.5 rounded-xl bg-chalk/[0.06] text-chalk
              font-extrabold text-[14px] border border-chalk/[0.08]">
            ⬇︎ Κατέβασμα PNG ({type === 'versus' ? `${size.w}×${size.h}` : '1080×1080'})
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

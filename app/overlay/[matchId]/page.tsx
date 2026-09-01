'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'
import { useNow } from '@/lib/hooks/useNow'
import { clockLabel, clockStoppage } from '@/lib/clock'
import { fmtMinute } from '@/lib/match'
import LineupPitch from '@/app/lineup-pitch'
import type { Period } from '@/lib/types'

type Theme = { acc: string; acc2: string; bg0: string; bg1: string }
const THEMES: Record<string, Theme> = {
  orange: { acc: '#FF7A2F', acc2: '#E05B1F', bg0: '#0e1830', bg1: '#0a1020' },
  yellow: { acc: '#F2C230', acc2: '#D8A21F', bg0: '#1a1608', bg1: '#0e0c05' },
  miami:  { acc: '#ff2d95', acc2: '#d81f7a', bg0: '#1a0d3d', bg1: '#0a0618' },
}
const KEYS = ['orange', 'yellow', 'miami']
function themeFor(leagueId: string | undefined, override: string | null): Theme {
  if (override && THEMES[override]) return THEMES[override]
  let h = 0
  const s = leagueId ?? ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return THEMES[KEYS[h % 3]]
}

// Παλέτα scoreboard/γραφικών ανά πρωτάθλημα (βαθύ τόνος + φωτεινό accent).
type PLTheme = { deep: string; deep2: string; dark: string; pink: string; pink2: string }
const PL_DEFAULT: PLTheme = { deep: '#3d0a45', deep2: '#26002c', dark: '#12001a', pink: '#ff2882', pink2: '#e0176b' }
const LEAGUE_THEMES: { re: RegExp; t: PLTheme }[] = [
  { re: /elite/i,  t: { deep: '#3a2a05', deep2: '#241a02', dark: '#120c00', pink: '#F7B01B', pink2: '#E08A00' } }, // πορτοκαλοκίτρινο
  { re: /liga/i,   t: { deep: '#33300a', deep2: '#201e04', dark: '#100f00', pink: '#FFE000', pink2: '#E5C400' } }, // καναρίνι
  { re: /master/i, t: { deep: '#08301f', deep2: '#041d12', dark: '#010d07', pink: '#2BD46E', pink2: '#16A34A' } }, // πράσινο
  { re: /trophy/i, t: { deep: '#340a08', deep2: '#200503', dark: '#100201', pink: '#F0463A', pink2: '#C41F16' } }, // κόκκινο
  { re: /east/i,   t: { deep: '#0a1838', deep2: '#050e22', dark: '#01060f', pink: '#3A78FF', pink2: '#1E4FCC' } }, // μπλε
  { re: /summer/i, t: { deep: '#180a42', deep2: '#0d0620', dark: '#06010f', pink: '#37E0FF', pink2: '#B14BFF' } }, // miami neon
]
function leagueTheme(name?: string | null): PLTheme {
  if (!name) return PL_DEFAULT
  for (const { re, t } of LEAGUE_THEMES) if (re.test(name)) return t
  return PL_DEFAULT
}
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
// Σκούρο ή λευκό κείμενο πάνω σε φωτεινό accent (ώστε το ρολόι να διαβάζεται σε κίτρινο/γαλάζιο)
function idealText(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#141414' : '#fff'
}

type Kind = 'GOAL' | 'OWN' | 'YELLOW' | 'RED'
type Pop = { kind: Kind; name: string; sub: string; photo: string | null; assist?: string }
type BigKind = 'KICKOFF' | 'HT' | 'FT'
const BIG_META: Record<BigKind, { label: string; sub: string }> = {
  KICKOFF: { label: 'ΕΝΑΡΞΗ ΑΓΩΝΑ', sub: 'Καλή διασκέδαση' },
  HT:      { label: 'ΗΜΙΧΡΟΝΟ',     sub: 'Τα ξαναλέμε σε λίγο' },
  FT:      { label: 'ΤΕΛΙΚΟ',       sub: 'Τελικό αποτέλεσμα' },
}
type Sub = { side: 'a' | 'b'; outName: string; inName: string; team: string; min: string }
const POP_META: Record<Kind, { icon: string; label: string; bg: [string, string] }> = {
  GOAL:   { icon: '⚽', label: 'ΓΚΟΛ',          bg: ['', ''] },
  OWN:    { icon: '🔻', label: 'ΑΥΤΟΓΚΟΛ',      bg: ['', ''] },
  YELLOW: { icon: '🟨', label: 'ΚΙΤΡΙΝΗ ΚΑΡΤΑ', bg: ['#F2C230', '#D8A21F'] },
  RED:    { icon: '🟥', label: 'ΚΟΚΚΙΝΗ ΚΑΡΤΑ', bg: ['#D8483C', '#B23227'] },
}

/** «Επίθετο Α.» — επίθετο + αρχικό μικρού ονόματος (για τον πάγκο). */
function surnameInitial(n?: string | null) {
  if (!n) return '—'
  const parts = n.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[parts.length - 1]} ${parts[0][0]}.` : n
}

export default function OverlayPage() {
  return <Suspense><Overlay /></Suspense>
}

function Overlay() {
  const { matchId } = useParams()
  const params = useSearchParams()
  const { match, events, lastSync } = useLiveMatch(matchId as string)
  const now = useNow(1000)

  const preview = params.get('preview') != null
  // Μέγεθος & θέση scoreboard — ζωντανά ρυθμιζόμενα στην προεπισκόπηση (αρχική τιμή από URL)
  const [userScale, setUserScale] = useState(parseFloat(params.get('scale') || '1') || 1)
  const [pos, setPos] = useState(params.get('pos') || 'tl')
  // Λογότυπο καναλιού πάνω-δεξιά (κείμενο· ρυθμίζεται από την προεπισκόπηση ή ?brand=)
  const [brand, setBrand] = useState(params.get('brand') ?? 'SALTV1')
  const [live, setLive] = useState(params.get('live') !== '0')  // παλλόμενο LIVE (default on)
  const urlSponsors = (params.get('sponsors') || '').split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean)
  const [dbSponsors, setDbSponsors] = useState<string[]>([])
  const sponsors = urlSponsors.length ? urlSponsors : dbSponsors
  const [linkCopied, setLinkCopied] = useState(false)
  // Κέντρο του μπλοκ σκορ, για να κάτσει το καρτελάκι πρωταθλήματος ακριβώς από κάτω
  const scoreRef = useRef<HTMLDivElement>(null)
  const [scoreCX, setScoreCX] = useState<number | null>(null)
  useEffect(() => {
    const el = scoreRef.current
    if (el) setScoreCX(el.offsetLeft + el.offsetWidth / 2)
  }, [match?.team_a_data?.name])

  const [popup, setPopup] = useState<Pop | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const popTimer = useRef<ReturnType<typeof setTimeout>>()
  const [flash, setFlash] = useState<string | null>(null)
  const [lineupsOn, setLineupsOn] = useState(false)
  const [scorersOn, setScorersOn] = useState(false)
  const scorersTimer = useRef<ReturnType<typeof setTimeout>>()
  const [standingsOn, setStandingsOn] = useState(false)
  const [standRows, setStandRows] = useState<any[]>([])
  const standTimer = useRef<ReturnType<typeof setTimeout>>()
  const [preMatchOn, setPreMatchOn] = useState(false)
  const [preRows, setPreRows] = useState<any[]>([])
  const preTimer = useRef<ReturnType<typeof setTimeout>>()
  // Αυτόματη λειτουργία: το overlay βγάζει μόνο του τα ενημερωτικά γραφικά
  const [auto, setAuto] = useState(params.get('auto') === '1')
  const prevAutoCP = useRef<string | null | undefined>(undefined)
  const preFired = useRef(false)
  const [luTeam, setLuTeam] = useState<'a' | 'b'>('a')
  const [squadMap, setSquadMap] = useState<Record<string, any>>({})
  const [bigCard, setBigCard] = useState<BigKind | null>(null)
  const [subCard, setSubCard] = useState<Sub | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  const bigTimer = useRef<ReturnType<typeof setTimeout>>()
  const subTimer = useRef<ReturnType<typeof setTimeout>>()
  const prevCP = useRef<string | null | undefined>(undefined)
  const prevSubTs = useRef<number>(0)
  const supa = useRef(createClient())

  // Κοινές «σκανδάλες» γραφικών (χρησιμοποιούνται από κουμπιά + αυτόματη λειτουργία)
  function showStandings() {
    setStandingsOn(false); setTimeout(() => setStandingsOn(true), 30)
    clearTimeout(standTimer.current); standTimer.current = setTimeout(() => setStandingsOn(false), 7000)
  }
  function showScorers() {
    setScorersOn(false); setTimeout(() => setScorersOn(true), 30)
    clearTimeout(scorersTimer.current); scorersTimer.current = setTimeout(() => setScorersOn(false), 5000)
  }
  function showPreMatch() {
    setPreMatchOn(false); setTimeout(() => setPreMatchOn(true), 30)
    clearTimeout(preTimer.current); preTimer.current = setTimeout(() => setPreMatchOn(false), 5000)
  }
  function showLineups() { setLineupsOn(false); setTimeout(() => setLineupsOn(true), 30) }

  // Καμβάς σχεδίασης 1280×720· κλιμακώνεται για να γεμίσει την πραγματική οθόνη/OBS
  const REF_W = 1280, REF_H = 720
  const [pscale, setPscale] = useState(0.3)
  // callback ref: στήνει τη μέτρηση τη στιγμή που το stage μπαίνει στο DOM
  // (το component κάνει early-return όσο δεν έχει φορτώσει ο αγώνας, οπότε
  //  ένα effect με deps [preview] δεν θα προλάβαινε ποτέ το πραγματικό node)
  const cleanupRef = useRef<() => void>()
  const setStage = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = undefined
    if (!el) return
    const calc = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setPscale(p => (Math.abs(p - w / REF_W) > 0.002 ? w / REF_W : p))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    window.addEventListener('resize', calc)
    window.addEventListener('orientationchange', calc)
    window.visualViewport?.addEventListener('resize', calc)
    const iv = setInterval(calc, 300)
    cleanupRef.current = () => {
      ro.disconnect()
      window.removeEventListener('resize', calc)
      window.removeEventListener('orientationchange', calc)
      window.visualViewport?.removeEventListener('resize', calc)
      clearInterval(iv)
    }
  }, [])

  // Watchdog (μόνο στο πραγματικό OBS overlay): αν για πολλή ώρα δεν έρθει
  // καμία επιτυχής ενημέρωση (κολλημένη σελίδα/νεκρό δίκτυο), κάνε reload μόνο σου.
  const lastSyncRef = useRef(lastSync)
  lastSyncRef.current = lastSync
  const loadedRef = useRef(false)
  if (match) loadedRef.current = true
  useEffect(() => {
    if (preview) return
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible' || !loadedRef.current) return
      if (Date.now() - lastSyncRef.current > 70000) window.location.reload()
    }, 15000)
    return () => clearInterval(iv)
  }, [preview])

  // Κλίμακα πραγματικού overlay (OBS): ΚΑΛΥΠΤΕΙ όλη την οθόνη (cover), ώστε οι γωνίες
  // (σκορ πάνω-αριστερά, χορηγοί κάτω-αριστερά) να κολλάνε πάντα, ακόμη κι αν το
  // browser source δεν είναι ακριβώς 16:9.
  const [realFit, setRealFit] = useState(1)
  useEffect(() => {
    if (preview) return
    const calc = () => setRealFit(Math.max(window.innerWidth / REF_W, window.innerHeight / REF_H))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [preview])

  useEffect(() => {
    if (preview) return
    const b = document.body.style.cssText
    const h = document.documentElement.style.cssText
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
    document.documentElement.style.background = 'transparent'
    document.documentElement.style.margin = '0'
    document.documentElement.style.overflow = 'hidden'
    return () => { document.body.style.cssText = b; document.documentElement.style.cssText = h }
  }, [preview])

  useEffect(() => {
    let ch: any
    let dead = false
    const onFlash = ({ payload }: any) => {
      // Ζωντανή αλλαγή καναλιού / LIVE από τον σπίκερ → ενημερώνεται ακαριαία το OBS
      if (payload?.kind === 'BRAND') { setBrand(payload.value ?? ''); return }
      if (payload?.kind === 'LIVE')  { setLive(!!payload.on); return }
      if (payload?.kind === 'AUTO')  { setAuto(!!payload.on); return }
      if (payload?.kind === 'LINEUPS') { setLineupsOn(false); setTimeout(() => setLineupsOn(true), 30); return }
      if (payload?.kind === 'SCORERS') {
        setScorersOn(false); setTimeout(() => setScorersOn(true), 30)
        clearTimeout(scorersTimer.current)
        scorersTimer.current = setTimeout(() => setScorersOn(false), 4000)
        return
      }
      if (payload?.kind === 'STANDINGS') {
        setStandingsOn(false); setTimeout(() => setStandingsOn(true), 30)
        clearTimeout(standTimer.current)
        standTimer.current = setTimeout(() => setStandingsOn(false), 7000)
        return
      }
      if (payload?.kind === 'PREMATCH') {
        setPreMatchOn(false); setTimeout(() => setPreMatchOn(true), 30)
        clearTimeout(preTimer.current)
        preTimer.current = setTimeout(() => setPreMatchOn(false), 5000)
        return
      }
      setFlash(payload?.kind ?? null)
      clearTimeout(flashTimer.current)
      if (payload?.kind) flashTimer.current = setTimeout(() => setFlash(null), 6000)
    }
    // Επανασύνδεση αν πέσει το κανάλι (π.χ. στο OBS μετά από ώρα)
    const connect = () => {
      ch = supa.current.channel(`overlay:${matchId}`)
        .on('broadcast', { event: 'flash' }, onFlash)
        .subscribe((status: string) => {
          if (!dead && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) {
            supa.current.removeChannel(ch)
            setTimeout(() => { if (!dead) connect() }, 2500)
          }
        })
    }
    connect()
    const onVis = () => { if (document.visibilityState === 'visible' && !dead) { supa.current.removeChannel(ch); connect() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { dead = true; document.removeEventListener('visibilitychange', onVis); supa.current.removeChannel(ch) }
  }, [matchId])

  // Χορηγοί από τη βάση (καθολικοί) — αν δεν δόθηκαν στο URL.
  // Ξαναδιαβάζουμε περιοδικά ώστε αν αποθηκευτούν αφού άνοιξε το OBS, να εμφανιστούν χωρίς reload.
  useEffect(() => {
    if (urlSponsors.length) return
    let alive = true
    const load = () => supa.current.from('app_settings').select('sponsors').eq('id', 1).maybeSingle()
      .then(({ data }: any) => { if (alive) setDbSponsors(data?.sponsors ?? []) })
    load()
    const iv = setInterval(load, 30000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [urlSponsors.length])

  // Βαθμολογία: φόρτωσε το table του πρωταθλήματος όταν ζητηθεί (ή προφόρτωσε στο load)
  useEffect(() => {
    const lid = match?.league_id
    if (!lid) return
    supa.current.from('standings').select('*').eq('league_id', lid).order('position')
      .then(({ data }: any) => setStandRows(data ?? []))
  }, [match?.league_id, standingsOn])

  // Playoff διπλός: το άλλο σκέλος (για συνολικό σκορ στο scoreboard)
  const [otherLegs, setOtherLegs] = useState<any[]>([])
  useEffect(() => {
    const stg = match?.stage, a = match?.team_a, b = match?.team_b
    if (!stg || stg === 'Final' || !a || !b) { setOtherLegs([]); return }
    supa.current.from('matches')
      .select('match_id, team_a, team_b, goals_team_a, goals_team_b, match_status, stage')
      .eq('stage', stg)
      .or(`and(team_a.eq.${a},team_b.eq.${b}),and(team_a.eq.${b},team_b.eq.${a})`)
      .then(({ data }: any) => setOtherLegs((data ?? []).filter((x: any) => x.match_id !== match?.match_id)))
  }, [match?.stage, match?.team_a, match?.team_b, match?.match_id])

  // Pre-match: παλαιότεροι αγώνες των δύο ομάδων (για φόρμα + ιστορικό H2H)
  useEffect(() => {
    const a = match?.team_a, b = match?.team_b
    if (!a || !b) return
    supa.current.from('matches')
      .select('team_a, team_b, goals_team_a, goals_team_b, match_date, match_status')
      .in('match_status', ['Played', 'Forfeit'])
      .or(`team_a.in.(${a},${b}),team_b.in.(${a},${b})`)
      .order('match_date', { ascending: false }).limit(80)
      .then(({ data }: any) => setPreRows(data ?? []))
  }, [match?.team_a, match?.team_b, preMatchOn])

  // Συνθέσεις: 5 δευτ. ομάδα Α, 5 δευτ. ομάδα Β, μετά εξαφανίζεται μόνο του
  useEffect(() => {
    if (!lineupsOn) return
    setLuTeam('a')
    const t1 = setTimeout(() => setLuTeam('b'), 5000)
    const t2 = setTimeout(() => setLineupsOn(false), 10000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [lineupsOn])

  useEffect(() => {
    if (!match) return
    const ids = [...(match.squad_a ?? []), ...(match.squad_b ?? [])]
    if (!ids.length) return
    supa.current.from('players').select('player_id, full_name, number, photo_url, team:team_id(kit_primary, kit_secondary, kit_pattern)').in('player_id', ids)
      .then(({ data }) => {
        const m: Record<string, any> = {}
        ;(data ?? []).forEach((p: any) => { m[p.player_id] = p })
        setSquadMap(m)
      })
    // Εξαρτάται από τις ΣΥΜΜΕΤΟΧΕΣ (όχι μόνο το match_id): αν ο σπίκερ προσθέσει
    // παίκτες αργότερα (αλλαγή συμμετοχών), ξαναφορτώνουμε ώστε να εμφανιστούν ζωντανά.
  }, [(match?.squad_a ?? []).join(','), (match?.squad_b ?? []).join(',')])

  // Αυτόματα γραφικά από το ρολόι: Έναρξη / Ημίχρονο / Τελικό
  useEffect(() => {
    const cp = match?.clock_period
    if (prevCP.current === undefined) { prevCP.current = cp ?? null; return } // αγνόησε το πρώτο render
    if (cp === prevCP.current) return
    const prev = prevCP.current
    prevCP.current = cp ?? null
    let kind: BigKind | null = null
    if (cp === 'H1' && (prev == null || prev === 'FT')) kind = 'KICKOFF'
    else if (cp === 'HT') kind = 'HT'
    else if (cp === 'FT') kind = 'FT'
    if (!kind) return
    setBigCard(kind)
    clearTimeout(bigTimer.current)
    bigTimer.current = setTimeout(() => setBigCard(null), kind === 'KICKOFF' ? 8000 : 11000)
  }, [match?.clock_period])

  // ΑΥΤΟΜΑΤΗ ΛΕΙΤΟΥΡΓΙΑ — στο ημίχρονο/τελικό βγάζει μόνο του βαθμολογία & σκόρερς,
  // ώστε ο σπίκερ να σχολιάζει χωρίς να πατάει κουμπιά.
  useEffect(() => {
    const cp = match?.clock_period
    if (!auto) { prevAutoCP.current = cp ?? null; return }
    if (prevAutoCP.current === undefined) { prevAutoCP.current = cp ?? null; return }
    if (cp === prevAutoCP.current) return
    prevAutoCP.current = cp ?? null
    const timers: ReturnType<typeof setTimeout>[] = []
    if (cp === 'HT') {                       // Ημίχρονο: μετά την κάρτα → βαθμολογία, μετά σκόρερς
      timers.push(setTimeout(showStandings, 12000))
      timers.push(setTimeout(showScorers, 20500))
    } else if (cp === 'FT') {                // Τελικό: σκόρερς, μετά τελική βαθμολογία
      timers.push(setTimeout(showScorers, 12000))
      timers.push(setTimeout(showStandings, 18000))
    }
    return () => timers.forEach(clearTimeout)
  }, [auto, match?.clock_period])

  // ΑΥΤΟΜΑΤΗ ΛΕΙΤΟΥΡΓΙΑ — μία φορά πριν το σφύριγμα: pre-match κάρτα + συνθέσεις
  useEffect(() => {
    if (!auto || preFired.current) return
    if (match?.clock_period || match?.match_status === 'Played' || match?.match_status === 'Forfeit') return
    preFired.current = true
    const t1 = setTimeout(showPreMatch, 1200)   // pre-match κάρτα (5s)
    const t2 = setTimeout(showLineups, 8000)     // μετά οι συνθέσεις (~10s)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [auto, match?.clock_period, match?.match_status])

  // Αυτόματη κάρτα αλλαγής (IN/OUT) όταν προστίθεται νέα αλλαγή
  useEffect(() => {
    const subs = match?.subs as any[] | undefined
    if (!subs?.length) return
    const last = subs[subs.length - 1]
    const ts = last?.ts ?? 0
    if (prevSubTs.current === 0) { prevSubTs.current = ts; return } // αγνόησε τις υπάρχουσες στο load
    if (ts <= prevSubTs.current) return
    prevSubTs.current = ts
    const team = last.side === 'a' ? match.team_a_data?.name : match.team_b_data?.name
    setSubCard({
      side: last.side,
      inName: squadMap[last.in]?.full_name ?? '—',
      outName: squadMap[last.out]?.full_name ?? '—',
      team: team ?? '',
      min: fmtMinute(last.period as Period, last.minute),
    })
    clearTimeout(subTimer.current)
    subTimer.current = setTimeout(() => setSubCard(null), 6500)
  }, [match?.subs, squadMap])

  useEffect(() => {
    if (!match) return
    const kinds: Kind[] = ['GOAL', 'OWN', 'YELLOW', 'RED']
    const rel = events.filter((e: any) => kinds.includes(e.event_type))
    const fresh = rel.filter((g: any) => !seen.current.has(g.event_id))
    fresh.forEach((g: any) => seen.current.add(g.event_id))
    const recent = fresh.filter((g: any) => Date.now() - new Date(g.created_at).getTime() < 20000)
    if (recent.length) {
      const g = recent[recent.length - 1]
      // Αυτογκόλ: μετράει στην ΑΝΤΙΠΑΛΗ ομάδα (αυτή που πήγε +1)
      const isOwn = g.event_type === 'OWN'
      const scoredForId = isOwn ? (g.team_id === match.team_a ? match.team_b : match.team_a) : g.team_id
      const team = scoredForId === match.team_a ? match.team_a_data?.name : match.team_b_data?.name
      // Ασίστ: ζευγάρωμα με γκολ ίδιας ομάδας/ημιχρόνου στο ίδιο λεπτό
      const assist = g.event_type === 'GOAL'
        ? events.find((e: any) => e.event_type === 'ASSIST' && e.team_id === g.team_id
            && e.period === g.period && Math.abs((e.minute ?? 0) - (g.minute ?? 0)) <= 1)?.player?.full_name
        : undefined
      setPopup({
        kind: g.event_type as Kind,
        name: g.player?.full_name ?? POP_META[g.event_type as Kind].label,
        sub: `${(team ?? '').toUpperCase()} · ${fmtMinute(g.period as Period, g.minute)}${isOwn ? ' · ΑΥΤΟΓΚΟΛ' : ''}`,
        photo: g.player?.photo_url ?? null,
        assist: assist || undefined,
      })
      clearTimeout(popTimer.current)
      popTimer.current = setTimeout(() => setPopup(null), 5500)
    }
  }, [events, match])

  if (!match) return null

  const t = themeFor(match.league_id, params.get('theme'))
  const clk = clockLabel(match.clock_period, match.clock_started_at, now)
  const clkStop = clockStoppage(match.clock_period, match.clock_started_at, now)
  const PP: 'fixed' | 'absolute' = 'absolute'

  // Συνολικό σκορ διπλού playoff (τρέχον ζωντανό + προηγούμενα σκέλη). Εμφανίζεται
  // μόνο αν υπάρχει ολοκληρωμένο άλλο σκέλος (δηλ. στον 2ο αγώνα).
  const tieAgg = (() => {
    if (!match.stage || match.stage === 'Final') return null
    if (!otherLegs.some(l => ['Played', 'Forfeit'].includes(l.match_status))) return null
    let a = match.goals_team_a ?? 0, b = match.goals_team_b ?? 0
    for (const l of otherLegs) {
      if (!['Played', 'Forfeit'].includes(l.match_status)) continue
      a += l.team_a === match.team_a ? (l.goals_team_a ?? 0) : (l.goals_team_b ?? 0)
      b += l.team_a === match.team_a ? (l.goals_team_b ?? 0) : (l.goals_team_a ?? 0)
    }
    return { a, b }
  })()

  // Παλέτα scoreboard/γραφικών — αλλάζει ανά πρωτάθλημα (accent + βαθύ τόνος)
  const PL = leagueTheme(match.league?.name)

  const M = Number.isFinite(parseInt(params.get('margin') || '')) ? parseInt(params.get('margin')!) : 0
  const posStyle: React.CSSProperties =
    pos === 'tl' ? { top: M, left: M, alignItems: 'flex-start' }
    : pos === 'tr' ? { top: M, right: M, alignItems: 'flex-end' }
    : pos === 'br' ? { bottom: M, right: M, alignItems: 'flex-end' }
    : { bottom: M, left: M, alignItems: 'flex-start' }
  const tOrigin = pos === 'tl' ? 'top left' : pos === 'tr' ? 'top right'
    : pos === 'br' ? 'bottom right' : 'bottom left'

  const Crest = ({ name, logo, size }: { name?: string; logo?: string | null; size: number }) => (
    <span style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
      fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.14)',
      border: '2px solid rgba(255,255,255,.85)', overflow: 'hidden', flex: 'none', fontSize: size * 0.4 }}>
      {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : (name?.[0] ?? '?').toUpperCase()}
    </span>
  )

  const popBg = popup ? ((popup.kind === 'GOAL' || popup.kind === 'OWN') ? [PL.pink, PL.pink2] : POP_META[popup.kind].bg) : ['', '']

  const styleTag = (
    <style>{`
      @keyframes ovGoal{from{opacity:0;transform:translate(-50%,-12px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
      @keyframes ovMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      @keyframes ovPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
      @keyframes ovLiveRing{0%{transform:scale(1);opacity:.55}80%{transform:scale(2.8);opacity:0}100%{transform:scale(2.8);opacity:0}}
    `}</style>
  )

  // Καρτελάκι πρωταθλήματος — κολλητά πάνω-κέντρο σε Σύνθεση/Σκόρερς (στυλ PL)
  const leagueTab = (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap',
      background: PL.deep2, border: '1px solid rgba(255,255,255,.10)', borderBottom: 'none',
      borderTop: `3px solid ${PL.pink}`, borderRadius: '10px 10px 0 0', padding: '7px 18px' }}>
      <Crest name={match.league?.name} logo={match.league?.logo_url} size={34} />
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
        color: '#fff' }}>{match.league?.name}</span>
    </div>
  )

  const luLine: string[] = ((luTeam === 'a' ? match.lineup_a : match.lineup_b) ?? [])
  const luForm = (luTeam === 'a' ? match.formation_a : match.formation_b) ?? '3-3-1'
  const luName = luTeam === 'a' ? match.team_a_data?.name : match.team_b_data?.name
  const luLogo = luTeam === 'a' ? match.team_a_data?.logo_url : match.team_b_data?.logo_url
  // Πάγκος: όσοι συμμετέχουν (squad) αλλά δεν είναι στην ενδεκάδα (lineup)
  const luSquad: string[] = ((luTeam === 'a' ? match.squad_a : match.squad_b) ?? [])
  const luBench = luSquad.filter(id => id && !luLine.includes(id))
  const lineupsEl = lineupsOn && (
    <div style={{ position: PP, top: 24, left: 0, right: 0, bottom: 90,
      display: 'grid', placeItems: 'start center', pointerEvents: 'none' }}>
      {/* Το scoreboard κρύβεται στις συνθέσεις, οπότε η σύνθεση πάει ψηλά & μεγαλώνει.
          Κάρφωμα στην κορυφή + scale από πάνω· το bottom:90 αφήνει χώρο πάνω από τους χορηγούς. */}
      <div style={{ transform: 'scale(0.86)', transformOrigin: 'top center' }}>
      <div key={luTeam} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        width: 430, animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        {leagueTab}
        {/* Όνομα ομάδας — μέσα στη στοίβα, ώστε τίτλος+γήπεδο να κεντράρονται μαζί */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11 }}>
          <Crest name={luName} logo={luLogo} size={44} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 27, fontWeight: 800, textTransform: 'uppercase', color: '#fff',
              lineHeight: 1.05, textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>{luName}</div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.14em', color: PL.pink }}>
              {luForm} · ΣΥΝΘΕΣΗ</div>
          </div>
        </div>
        <LineupPitch formation={luForm} line={luLine} players={squadMap} accent={PL.pink}
          bg="rgba(38,0,44,0.55)" borderColor={PL.pink} />
        {luBench.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center',
            alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.14em', color: PL.pink }}>ΠΑΓΚΟΣ</span>
            {luBench.map(id => {
              const p = squadMap[id]
              return (
                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(38,0,44,0.6)', border: `1px solid ${PL.pink}`, borderRadius: 20,
                  padding: '4px 11px 4px 5px' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: PL.pink, color: '#fff',
                    fontSize: 11, fontWeight: 900, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                    {p?.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (p?.number ?? (p?.full_name?.[0] ?? '?'))}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{surnameInitial(p?.full_name)}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  )

  // Σκόρερς — γκολ ανά παίκτη, ανά ομάδα. Το αυτογκόλ μπαίνει στην ομάδα που
  // πήγε +1 (η αντίπαλη του παίκτη) με σήμανση «αυτ.».
  const scorersOf = (teamId: string) => {
    const other = teamId === match.team_a ? match.team_b : match.team_a
    const goals = new Map<string, number>()
    events.filter((e: any) => e.event_type === 'GOAL' && e.team_id === teamId && e.period !== 'PEN')
      .forEach((e: any) => { const n = e.player?.full_name ?? '—'; goals.set(n, (goals.get(n) ?? 0) + 1) })
    const owns = new Map<string, number>()
    events.filter((e: any) => e.event_type === 'OWN' && e.team_id === other && e.period !== 'PEN')
      .forEach((e: any) => { const n = e.player?.full_name ?? '—'; owns.set(n, (owns.get(n) ?? 0) + 1) })
    return [
      ...[...goals.entries()].map(([n, c]) => ({ n, c, own: false })),
      ...[...owns.entries()].map(([n, c]) => ({ n, c, own: true })),
    ]
  }
  const scCol = (teamId: string, name?: string, logo?: string | null) => {
    const list = scorersOf(teamId)
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12,
          paddingBottom: 8, borderBottom: `2px solid ${PL.pink}` }}>
          <Crest name={name} logo={logo} size={30} />
          <span style={{ fontSize: 17, fontWeight: 800, textTransform: 'uppercase', color: '#fff',
            lineHeight: 1.1 }}>{name}</span>
        </div>
        {list.length ? list.map(({ n, c, own }, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0',
            fontSize: 16, color: '#fff' }}>
            <span style={{ color: PL.pink, flex: 'none' }}>{own ? '🔻' : '⚽'}</span>
            <span style={{ fontWeight: 700, lineHeight: 1.15 }}>
              {n}
              {own && <span style={{ color: PL.pink, fontWeight: 800, fontSize: 13 }}> (αυτ.)</span>}
              {c > 1 ? <span style={{ color: PL.pink, fontWeight: 900 }}>{` ×${c}`}</span> : ''}</span>
          </div>
        )) : <div style={{ fontSize: 14, color: 'rgba(255,255,255,.5)' }}>—</div>}
      </div>
    )
  }
  const scorersEl = scorersOn && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        {leagueTab}
        <div style={{ width: 680, borderRadius: '0 0 16px 16px', overflow: 'hidden',
          background: `linear-gradient(180deg, ${PL.deep}, ${PL.dark})`,
          border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 26px 70px rgba(0,0,0,.6)' }}>
        {/* Ματζέντα λωρίδα κορυφής (PL) */}
        <div style={{ height: 5, background: `linear-gradient(90deg, ${PL.pink}, ${PL.pink2})` }} />
        <div style={{ padding: '20px 30px 24px' }}>
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 800, letterSpacing: '.28em',
            color: PL.pink, marginBottom: 18 }}>ΣΚΟΡΕΡΣ</div>
          <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start' }}>
            {scCol(match.team_a, match.team_a_data?.name, match.team_a_data?.logo_url)}
            <div style={{ alignSelf: 'stretch', width: 1, background: 'rgba(255,255,255,.14)' }} />
            {scCol(match.team_b, match.team_b_data?.name, match.team_b_data?.logo_url)}
          </div>
        </div>
        </div>
      </div>
    </div>
  )

  // Βαθμολογία — πλήρης πίνακας πρωταθλήματος· οι δύο ομάδες που παίζουν τονίζονται
  const stHead = (label: string, w: number, align: 'left' | 'right' | 'center' = 'right') => (
    <span style={{ width: w, flex: 'none', textAlign: align, fontSize: 12, fontWeight: 900,
      letterSpacing: '.04em', color: 'rgba(255,255,255,.55)' }}>{label}</span>
  )
  const stNum = (v: number | string, w: number, strong = false) => (
    <span style={{ width: w, flex: 'none', textAlign: 'right', fontSize: 16,
      fontWeight: strong ? 900 : 700, color: strong ? '#fff' : 'rgba(255,255,255,.9)',
      fontVariantNumeric: 'tabular-nums' }}>{v}</span>
  )
  // Ζωντανή βαθμολογία: όσο παίζεται ο αγώνας (και δεν έχει καταχωρηθεί ακόμη ως
  // «Played»), πρόσθεσε το τρέχον σκορ στις δύο ομάδες σαν να τελείωνε τώρα και
  // ξαναταξινόμησε — έτσι η θέση αλλάζει live αν προηγείται μια ομάδα.
  const liveProject = match.match_status !== 'Played' && match.match_status !== 'Forfeit'
    && (!!match.clock_period || match.match_status === 'Live'
        || (match.goals_team_a ?? 0) > 0 || (match.goals_team_b ?? 0) > 0)
  const stDisplay = (() => {
    if (!liveProject || !standRows.length) return standRows.map((r: any) => ({ ...r, _delta: 0 }))
    const basePos = new Map<string, number>(standRows.map((r: any) => [r.team_id, r.position]))
    const rows = standRows.map((r: any) => ({ ...r }))
    const apply = (teamId: string, gf: number, ga: number) => {
      const r = rows.find((x: any) => x.team_id === teamId)
      if (!r) return
      r.played += 1; r.goals_for += gf; r.goals_against += ga
      r.goal_diff = r.goals_for - r.goals_against
      if (gf > ga) { r.wins += 1; r.points += 3 }
      else if (gf === ga) { r.draws += 1; r.points += 1 }
      else { r.losses += 1 }
    }
    apply(match.team_a, match.goals_team_a, match.goals_team_b)
    apply(match.team_b, match.goals_team_b, match.goals_team_a)
    rows.sort((a: any, b: any) =>
      b.points - a.points || b.goal_diff - a.goal_diff || b.goals_for - a.goals_for
      || String(a.team_name).localeCompare(String(b.team_name)))
    rows.forEach((r: any, i: number) => { r.position = i + 1; r._delta = (basePos.get(r.team_id) ?? (i + 1)) - (i + 1) })
    return rows
  })()
  const standingsEl = standingsOn && standRows.length > 0 && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        {leagueTab}
        <div style={{ width: 720, borderRadius: '0 0 16px 16px', overflow: 'hidden',
          background: `linear-gradient(180deg, ${hexA(PL.deep, 0.8)}, ${hexA(PL.dark, 0.8)})`,
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 26px 70px rgba(0,0,0,.6)' }}>
          <div style={{ height: 5, background: `linear-gradient(90deg, ${PL.pink}, ${PL.pink2})` }} />
          <div style={{ padding: '16px 26px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '.28em', color: PL.pink }}>
                ΒΑΘΜΟΛΟΓΙΑ</span>
              {liveProject && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px',
                  borderRadius: 20, background: '#ff2d2d', color: '#fff', fontSize: 11, fontWeight: 900,
                  letterSpacing: '.1em' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />ΖΩΝΤΑΝΑ</span>
              )}
            </div>
            {/* Επικεφαλίδα στηλών */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 8px',
              borderBottom: `2px solid ${PL.pink}` }}>
              <span style={{ width: 40, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.55)',
                letterSpacing: '.04em' }}>ΟΜΑΔΑ</span>
              {stHead('Α', 34)}{stHead('Ν', 30)}{stHead('Ι', 30)}{stHead('Η', 30)}
              {stHead('ΔΤ', 44)}{stHead('Β', 44)}
            </div>
            {stDisplay.map((r: any) => {
              const mine = r.team_id === match.team_a || r.team_id === match.team_b
              const d = r._delta ?? 0
              return (
                <div key={r.team_id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 8,
                  background: mine ? hexA(PL.pink, 0.18) : 'transparent',
                  boxShadow: mine ? `inset 3px 0 0 ${PL.pink}` : 'none' }}>
                  <span style={{ width: 40, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 3, fontSize: 15, fontWeight: 900,
                    color: mine ? PL.pink : 'rgba(255,255,255,.7)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.position}
                    {d !== 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 10,
                        fontWeight: 900, lineHeight: 1, color: d > 0 ? '#35c66b' : '#e0563c' }}>
                        {d > 0 ? '▲' : '▼'}{Math.abs(d) > 1 ? Math.abs(d) : ''}</span>
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Crest name={r.team_name} logo={r.logo_url} size={26} />
                    <span style={{ fontSize: 16, fontWeight: mine ? 900 : 700, color: '#fff',
                      textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis' }}>{r.team_name}</span>
                  </div>
                  {stNum(r.played, 34)}{stNum(r.wins, 30)}{stNum(r.draws, 30)}{stNum(r.losses, 30)}
                  {stNum(r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff, 44)}
                  {stNum(r.points, 44, true)}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  // Pre-match κάρτα: θέση βαθμολογίας + φόρμα (τελευταία 5) + ιστορικό H2H
  const FORM_C: Record<string, string> = { W: '#35c66b', D: '#9a9aa5', L: '#e0563c' }
  const preTeamCol = (teamId: string, name?: string, logo?: string | null) => {
    const st = standRows.find((r: any) => r.team_id === teamId)
    const games = preRows.filter((m: any) => m.team_a === teamId || m.team_b === teamId).slice(0, 5)
    const form = games.map((m: any) => {
      const gf = m.team_a === teamId ? m.goals_team_a : m.goals_team_b
      const ga = m.team_a === teamId ? m.goals_team_b : m.goals_team_a
      return gf > ga ? 'W' : gf === ga ? 'D' : 'L'
    }).reverse()
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Crest name={name} logo={logo} size={58} />
        <span style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase', color: '#fff',
          textAlign: 'center', lineHeight: 1.05 }}>{name}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: PL.pink }}>
          {st ? `${st.position}ος · ${st.points}β` : '—'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          {form.length ? form.map((f, i) => (
            <span key={i} style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center',
              fontSize: 11, fontWeight: 900, color: '#fff', background: FORM_C[f] }}>{f === 'W' ? 'Ν' : f === 'D' ? 'Ι' : 'Η'}</span>
          )) : <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>χωρίς ιστορικό</span>}
        </div>
      </div>
    )
  }
  const h2hList = preRows.filter((m: any) =>
    (m.team_a === match.team_a && m.team_b === match.team_b) ||
    (m.team_a === match.team_b && m.team_b === match.team_a))
  let h2hA = 0, h2hD = 0, h2hB = 0
  h2hList.forEach((m: any) => {
    const gA = m.team_a === match.team_a ? m.goals_team_a : m.goals_team_b
    const gB = m.team_a === match.team_a ? m.goals_team_b : m.goals_team_a
    if (gA > gB) h2hA++; else if (gA === gB) h2hD++; else h2hB++
  })
  const h2hScores = h2hList.slice(0, 3).map((m: any) => {
    const gA = m.team_a === match.team_a ? m.goals_team_a : m.goals_team_b
    const gB = m.team_a === match.team_a ? m.goals_team_b : m.goals_team_a
    return `${gA}-${gB}`
  })
  const preMatchEl = preMatchOn && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        {leagueTab}
        <div style={{ width: 720, borderRadius: '0 0 16px 16px', overflow: 'hidden',
          background: `linear-gradient(180deg, ${hexA(PL.deep, 0.8)}, ${hexA(PL.dark, 0.8)})`,
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 26px 70px rgba(0,0,0,.6)' }}>
          <div style={{ height: 5, background: `linear-gradient(90deg, ${PL.pink}, ${PL.pink2})` }} />
          <div style={{ padding: '20px 30px 24px' }}>
            <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 800, letterSpacing: '.28em',
              color: PL.pink, marginBottom: 20 }}>ΑΝΑΛΥΣΗ ΑΓΩΝΑ</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              {preTeamCol(match.team_a, match.team_a_data?.name, match.team_a_data?.logo_url)}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 18 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(255,255,255,.35)' }}>VS</span>
              </div>
              {preTeamCol(match.team_b, match.team_b_data?.name, match.team_b_data?.logo_url)}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,.12)', margin: '22px 0 16px' }} />
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, letterSpacing: '.2em',
              color: 'rgba(255,255,255,.55)', marginBottom: 12 }}>ΜΕΤΑΞΥ ΤΟΥΣ</div>
            {h2hList.length ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{h2hA}</span>
                    <span style={{ fontSize: 22, color: PL.pink, fontWeight: 800 }}>–</span>
                    <span style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{h2hD}</span>
                    <span style={{ fontSize: 22, color: PL.pink, fontWeight: 800 }}>–</span>
                    <span style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{h2hB}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'rgba(255,255,255,.5)' }}>
                    Νίκες · Ισοπαλίες · Νίκες</span>
                </div>
                {h2hScores.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 26,
                    borderLeft: '1px solid rgba(255,255,255,.14)' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'rgba(255,255,255,.45)' }}>
                      ΤΕΛΕΥΤΑΙΑ</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '.06em' }}>
                      {h2hScores.join('  ·  ')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>
                Πρώτη μεταξύ τους αναμέτρηση</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const varEl = flash === 'VAR' && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '24px 44px', borderRadius: 18,
        background: 'linear-gradient(180deg,#1436b0,#0b2170)', color: '#fff',
        border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 22px 64px rgba(0,0,0,.6)',
        animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        <span style={{ fontSize: 48 }}>📺</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '.28em', opacity: .9 }}>VAR</div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.05 }}>Έλεγχος φάσης</div>
        </div>
      </div>
    </div>
  )

  // Κάρτα αλλαγής (IN ▲ / OUT ▼) — κέντρο οθόνης, όπως VAR/Συνθέσεις
  const subCardEl = subCard && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 34px', borderRadius: 16,
        background: 'rgba(6,10,16,.93)', border: '2px solid #35c66b', color: '#fff', whiteSpace: 'nowrap',
        boxShadow: '0 22px 64px rgba(0,0,0,.6)', animation: 'ovPop .45s cubic-bezier(.2,.9,.25,1) forwards' }}>
        <span style={{ fontSize: 44 }}>🔄</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.18em', color: '#9fe6bb' }}>
            ΑΛΛΑΓΗ · {(subCard.team || '').toUpperCase()} · {subCard.min}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: '#35c66b', fontSize: 20, fontWeight: 900 }}>▲</span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{subCard.inName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: '#e0563c', fontSize: 20, fontWeight: 900 }}>▼</span>
            <span style={{ fontSize: 19, fontWeight: 700, opacity: .75 }}>{subCard.outName}</span>
          </div>
        </div>
      </div>
    </div>
  )

  // Σκορ κάρτας: στο ΗΜΙΧΡΟΝΟ δείξε το σκορ ΜΟΝΟ του Α' ημιχρόνου (όχι το τρέχον/τελικό)
  const htGoals = (teamId: string, other: string) => events.filter((e: any) =>
    e.period === 'H1' &&
    ((e.event_type === 'GOAL' && e.team_id === teamId) ||
     (e.event_type === 'OWN'  && e.team_id === other))).length
  const bcA = bigCard === 'HT' ? htGoals(match.team_a, match.team_b) : match.goals_team_a
  const bcB = bigCard === 'HT' ? htGoals(match.team_b, match.team_a) : match.goals_team_b

  // Μεγάλη κάρτα από το ρολόι: Έναρξη / Ημίχρονο / Τελικό (+ χορηγοί στο διάλειμμα)
  const bigCardEl = bigCard && (
    <div style={{ position: PP, inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none',
      background: 'rgba(3,6,10,.5)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, overflow: 'hidden',
        padding: '32px 54px', borderRadius: 22, background: `linear-gradient(180deg, ${PL.deep}, ${PL.dark})`,
        border: '1px solid rgba(255,255,255,.10)', borderTop: `5px solid ${PL.pink}`,
        boxShadow: '0 30px 90px rgba(0,0,0,.65)', animation: 'ovPop .5s cubic-bezier(.2,.9,.25,1) forwards' }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '.3em', color: PL.pink, textTransform: 'uppercase' }}>
          {match.league?.name}</div>
        <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: '.14em', color: '#fff', lineHeight: 1 }}>
          {BIG_META[bigCard].label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Crest name={match.team_a_data?.name} logo={match.team_a_data?.logo_url} size={54} />
            <span style={{ fontSize: 24, fontWeight: 800, textTransform: 'uppercase' }}>{match.team_a_data?.name}</span>
          </div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>
            {bcA}<span style={{ color: PL.pink, margin: '0 12px' }}>·</span>{bcB}</div>
          <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 13 }}>
            <Crest name={match.team_b_data?.name} logo={match.team_b_data?.logo_url} size={54} />
            <span style={{ fontSize: 24, fontWeight: 800, textTransform: 'uppercase' }}>{match.team_b_data?.name}</span>
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, opacity: .6 }}>{BIG_META[bigCard].sub}</div>
        {bigCard !== 'KICKOFF' && sponsors.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: 'rgba(255,255,255,.45)' }}>
              POWERED BY</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              {sponsors.map((u, i) => (
                <span key={i} style={{ background: '#fff', borderRadius: 8, padding: '8px 14px', display: 'inline-flex' }}>
                  <img src={u} alt="" style={{ height: 34, display: 'block' }} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const sponsorsEl = sponsors.length > 0 && (
    <div style={{ position: PP, left: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 12,
      transform: 'scale(1.7)', transformOrigin: 'bottom left',
      background: 'rgba(0,0,0,.6)', borderTop: '1px solid rgba(255,255,255,.1)', borderRight: '1px solid rgba(255,255,255,.1)',
      borderRadius: '0 10px 0 0', padding: '8px 14px' }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.7)',
        whiteSpace: 'nowrap' }}>POWERED BY</span>
      <div style={{ width: 200, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 22, width: 'max-content', willChange: 'transform',
          animation: `ovMarquee ${Math.max(8, sponsors.length * 6)}s linear infinite` }}>
          {[...sponsors, ...sponsors].map((u, i) => (
            <span key={i} style={{ background: '#fff', borderRadius: 6, padding: '4px 9px', display: 'inline-flex' }}>
              <img src={u} alt="" style={{ height: 26, display: 'block' }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )

  const scoreEl = (
    <div style={{ position: PP, display: 'flex', flexDirection: 'column', ...posStyle,
      transform: `scale(${userScale})`, transformOrigin: tOrigin,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 12px 38px rgba(0,0,0,.55)', fontVariantNumeric: 'tabular-nums' }}>
          {/* Λεπτή ματζέντα ράβδος αριστερά (retro PL frame) */}
          <div style={{ width: 6, background: `linear-gradient(180deg, ${PL.pink}, ${PL.pink2})` }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 20px',
            background: `linear-gradient(180deg, ${PL.deep}, ${PL.deep2})`, color: '#fff', height: 68 }}>
            <Crest name={match.team_a_data?.name} logo={match.team_a_data?.logo_url} size={44} />
            <span style={{ fontSize: 23, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap',
              letterSpacing: '.01em' }}>{match.team_a_data?.name}</span>
          </div>
          <div ref={scoreRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 13, padding: '0 24px',
            background: PL.dark, color: '#fff', fontSize: 42, fontWeight: 900 }}>
            <span>{match.goals_team_a}</span>
            <span style={{ color: PL.pink, fontWeight: 800, fontSize: 26 }}>–</span>
            <span>{match.goals_team_b}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 13, padding: '0 20px',
            background: `linear-gradient(180deg, ${PL.deep}, ${PL.deep2})`, color: '#fff' }}>
            <Crest name={match.team_b_data?.name} logo={match.team_b_data?.logo_url} size={44} />
            <span style={{ fontSize: 23, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap',
              letterSpacing: '.01em' }}>{match.team_b_data?.name}</span>
          </div>
          {tieAgg && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, minWidth: 96, padding: '0 16px', color: '#E8B923', fontVariantNumeric: 'tabular-nums',
              background: 'linear-gradient(180deg,#3a2f0a,#241d06)' }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.14em', opacity: .9 }}>ΣΥΝΟΛΟ</span>
              <span style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{tieAgg.a}<span style={{ opacity: .6, margin: '0 3px' }}>-</span>{tieAgg.b}</span>
            </div>
          )}
          {clkStop && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, minWidth: 92, padding: '0 16px', color: idealText(PL.pink), fontVariantNumeric: 'tabular-nums',
              background: `linear-gradient(180deg, ${PL.pink}, ${PL.pink2})` }}>
              <span style={{ fontSize: 23, fontWeight: 900, lineHeight: 1 }}>{clkStop.main}</span>
              {clkStop.added && (
                <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1, letterSpacing: '.01em',
                  padding: '1px 7px', borderRadius: 5, background: 'rgba(0,0,0,.32)', color: '#fff' }}>
                  {clkStop.added}</span>
              )}
            </div>
          )}
        </div>
        {/* Πρωτάθλημα — καρτελάκι ακριβώς κάτω-κέντρο από το σκορ (το «0-0») */}
        <div style={{ position: 'absolute', top: '100%',
          left: scoreCX ?? 0, transform: scoreCX != null ? 'translateX(-50%)' : 'none',
          display: 'inline-flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap',
          background: PL.deep2, border: '1px solid rgba(255,255,255,.08)', borderTop: 'none',
          borderBottom: `3px solid ${PL.pink}`, borderRadius: '0 0 8px 8px', padding: '6px 16px' }}>
          <Crest name={match.league?.name} logo={match.league?.logo_url} size={24} />
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
            color: '#fff' }}>{match.league?.name}</span>
        </div>
        {popup && (
          <div style={{ position: 'absolute', left: '50%', top: 'calc(100% + 48px)', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px 14px 14px', borderRadius: 16,
            color: '#fff', whiteSpace: 'nowrap', border: `2px solid ${popBg[0]}`,
            background: (popup.kind === 'GOAL' || popup.kind === 'OWN')
              ? `linear-gradient(180deg, ${PL.deep}, ${PL.dark})` : 'rgba(6,10,16,.92)',
            boxShadow: '0 18px 50px rgba(0,0,0,.5)', animation: 'ovGoal .5s cubic-bezier(.2,.9,.25,1) forwards' }}>
            <span style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', flex: 'none',
              background: 'rgba(255,255,255,.08)', border: `2px solid ${popBg[0]}`, display: 'grid',
              placeItems: 'center', fontSize: 30 }}>
              {popup.photo ? <img src={popup.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : POP_META[popup.kind].icon}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.2em', color: popBg[0] }}>
                {POP_META[popup.kind].icon} {POP_META[popup.kind].label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{popup.name}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, opacity: .82, marginTop: 2 }}>{popup.sub}</div>
              {popup.assist && (
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2, color: popBg[0] }}>
                  🅰 ασίστ: <span style={{ color: '#fff' }}>{popup.assist}</span></div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // Στις συνθέσεις κρύβουμε το scoreboard, ώστε η σύνθεση να πάει πιο ψηλά & πιο μεγάλη
  // Πάνω-δεξιά HUD: λογότυπο καναλιού + παλλόμενο LIVE
  const brandEl = (brand || live) ? (
    <div style={{ position: PP, top: 16, right: 26, display: 'flex', flexDirection: 'column',
      alignItems: 'flex-end', gap: 8, pointerEvents: 'none' }}>
      {brand && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 32, fontWeight: 900, fontStyle: 'italic', color: '#fff', letterSpacing: '.02em',
            lineHeight: 1, textShadow: '0 2px 12px rgba(0,0,0,.75)',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}>{brand}</span>
          <span style={{ width: 46, height: 3, borderRadius: 2,
            background: `linear-gradient(90deg, ${PL.pink}, ${PL.pink2})` }} />
        </div>
      )}
      {live && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 10px',
          borderRadius: 8, background: 'rgba(6,10,16,.72)', border: '1px solid rgba(255,255,255,.12)' }}>
          {/* Παλλόμενο LIVE — δαχτυλίδι με transform/opacity (GPU-composited, χωρίς repaint) */}
          <span style={{ position: 'relative', width: 11, height: 11, display: 'inline-flex', flex: 'none' }}>
            <span style={{ position: 'absolute', top: 0, left: 0, width: 11, height: 11, borderRadius: '50%',
              background: '#ff2d2d', opacity: 0.55, transformOrigin: 'center',
              animation: 'ovLiveRing 1.5s ease-out infinite', willChange: 'transform, opacity' }} />
            <span style={{ position: 'relative', width: 11, height: 11, borderRadius: '50%', background: '#ff2d2d',
              boxShadow: '0 0 6px rgba(255,45,45,.7)' }} />
          </span>
          <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.18em', color: '#fff' }}>LIVE</span>
        </div>
      )}
    </div>
  ) : null

  const scene = <>{styleTag}{sponsorsEl}{!lineupsOn && !standingsOn && !preMatchOn && scoreEl}{brandEl}{subCardEl}{varEl}{lineupsEl}{scorersEl}{standingsEl}{preMatchEl}{bigCardEl}</>

  // Πραγματικό OBS: καμβάς 1280×720 κλιμακωμένος να γεμίσει την οθόνη
  if (!preview) return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: REF_W, height: REF_H,
      transformOrigin: 'top left', transform: `scale(${realFit})` }}>
      {scene}
    </div>
  )

  // Προεπισκόπηση: stage 16:9 (όπως θα φαίνεται στην οθόνη) + χειριστήρια από πάνω
  function testPop(kind: Kind) {
    setPopup({ kind, name: 'Δοκιμαστικός Παίκτης',
      sub: `${(match!.team_a_data?.name ?? '').toUpperCase()} · ${clk ?? "45'"}`, photo: null,
      assist: kind === 'GOAL' ? 'Δοκιμαστική Ασίστ' : undefined })
    clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setPopup(null), 5000)
  }
  function testBig(kind: BigKind) {
    setBigCard(kind)
    clearTimeout(bigTimer.current)
    bigTimer.current = setTimeout(() => setBigCard(null), kind === 'KICKOFF' ? 8000 : 11000)
  }
  function testSub() {
    setSubCard({ side: 'a', inName: 'Νέος Παίκτης', outName: 'Παλιός Παίκτης',
      team: match!.team_a_data?.name ?? '', min: clk ?? "70'" })
    clearTimeout(subTimer.current)
    subTimer.current = setTimeout(() => setSubCard(null), 6500)
  }
  const ctlBtn = (bg: string, fg: string, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ background: bg, color: fg, border: 0, borderRadius: 10,
      padding: '8px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#05060a', padding: 16, boxSizing: 'border-box',
      fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.6)',
            textTransform: 'uppercase' }}>Προεπισκόπηση · όπως θα φαίνεται στην οθόνη</span>
          {ctlBtn(t.acc, '#111', '⚽ Γκολ', () => testPop('GOAL'))}
          {ctlBtn(POP_META.YELLOW.bg[0], '#111', '🟨 Κίτρινη', () => testPop('YELLOW'))}
          {ctlBtn(POP_META.RED.bg[0], '#fff', '🟥 Κόκκινη', () => testPop('RED'))}
          {ctlBtn('#1436b0', '#fff', '📺 VAR', () => { setFlash('VAR'); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(null), 6000) })}
          {ctlBtn('#26303f', '#fff', '📋 Συνθέσεις', () => { setLineupsOn(false); setTimeout(() => setLineupsOn(true), 30) })}
          {ctlBtn('#1f5e3a', '#fff', '⚽ Σκόρερς', () => {
            setScorersOn(false); setTimeout(() => setScorersOn(true), 30)
            clearTimeout(scorersTimer.current); scorersTimer.current = setTimeout(() => setScorersOn(false), 4000)
          })}
          {ctlBtn('#3d0a45', '#fff', '📊 Βαθμολογία', () => {
            setStandingsOn(false); setTimeout(() => setStandingsOn(true), 30)
            clearTimeout(standTimer.current); standTimer.current = setTimeout(() => setStandingsOn(false), 7000)
          })}
          {ctlBtn('#12001a', '#fff', '📋 Pre-match', showPreMatch)}
          {ctlBtn(auto ? '#0e7a3a' : '#2b3242', '#fff', auto ? '🤖 Auto ON' : '🤖 Auto OFF', () => setAuto(a => !a))}
          {ctlBtn('#35c66b', '#062', '🔄 Αλλαγή', testSub)}
          {ctlBtn('#0e7a3a', '#fff', '🏁 Έναρξη', () => testBig('KICKOFF'))}
          {ctlBtn('#8a6d1f', '#fff', '⏸ Ημίχρονο', () => testBig('HT'))}
          {ctlBtn('#6d1f1f', '#fff', '🏆 Τελικό', () => testBig('FT'))}
        </div>
        <div ref={setStage} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9',
          borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)',
          background: 'linear-gradient(160deg,#0f2a1c,#0a1512 70%)' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: REF_W, height: REF_H,
            transformOrigin: 'top left', transform: `scale(${pscale})` }}>
            {scene}
          </div>
        </div>

        {/* Ρύθμιση μεγέθους & θέσης scoreboard — 1:1 με το OBS. Το stage πάνω είναι
            ακριβώς 16:9 όπως η οθόνη YouTube, άρα ό,τι βλέπεις εδώ βγαίνει και στο live. */}
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#0d1017',
          border: '1px solid rgba(255,255,255,.10)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', minWidth: 92 }}>
              Μέγεθος <span style={{ color: PL.pink }}>{Math.round(userScale * 100)}%</span></span>
            <input type="range" min={0.6} max={2.2} step={0.05} value={userScale}
              onChange={e => setUserScale(parseFloat(e.target.value))}
              style={{ flex: 1, minWidth: 180, accentColor: PL.pink }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', minWidth: 92 }}>Θέση</span>
            {([['tl', '↖ Πάνω αρ.'], ['tr', '↗ Πάνω δεξ.'], ['bl', '↙ Κάτω αρ.'], ['br', '↘ Κάτω δεξ.']] as const)
              .map(([v, lbl]) => (
              <button key={v} onClick={() => setPos(v)}
                style={{ background: pos === v ? PL.pink : '#1b2130', color: '#fff', border: 0,
                  borderRadius: 9, padding: '7px 11px', fontWeight: 800, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', minWidth: 92 }}>Κανάλι</span>
            {['SALTV1', 'SALTV2', 'SALTV3', ''].map(v => (
              <button key={v || 'none'} onClick={() => setBrand(v)}
                style={{ background: brand === v ? PL.pink : '#1b2130', color: '#fff', border: 0,
                  borderRadius: 9, padding: '7px 11px', fontWeight: 800, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit' }}>{v || 'Κανένα'}</button>
            ))}
            <button onClick={() => setLive(v => !v)}
              style={{ background: live ? '#c81e1e' : '#1b2130', color: '#fff', border: 0,
                borderRadius: 9, padding: '7px 11px', fontWeight: 800, fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit', marginLeft: 'auto' }}>🔴 LIVE {live ? 'ON' : 'OFF'}</button>
          </div>
          <button
            onClick={() => {
              const q = new URLSearchParams(params.toString())
              q.delete('preview')
              q.set('scale', userScale.toFixed(2))
              q.set('pos', pos)
              if (brand) q.set('brand', brand); else q.delete('brand')
              if (live) q.delete('live'); else q.set('live', '0')
              if (auto) q.set('auto', '1'); else q.delete('auto')
              const link = `${window.location.origin}/overlay/${matchId}?${q.toString()}`
              navigator.clipboard?.writeText(link)
              setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000)
            }}
            style={{ background: `linear-gradient(180deg, ${PL.pink}, ${PL.pink2})`, color: '#fff', border: 0,
              borderRadius: 10, padding: '12px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer',
              fontFamily: 'inherit' }}>
            {linkCopied ? '✓ Αντιγράφηκε — βάλ\'το στο OBS' : '📺 Αντιγραφή OBS link (με αυτό το μέγεθος)'}
          </button>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', margin: 0, lineHeight: 1.5 }}>
            Ρύθμισε το μέγεθος ώσπου να σου αρέσει πάνω στο 16:9 stage, μετά αντίγραψε το link και βάλ' το
            ως Browser Source στο OBS (1920×1080). Θα βγει ακριβώς στο ίδιο μέγεθος.
          </p>
        </div>
      </div>
    </div>
  )
}

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PERIODS, EVENTS, fmtMinute, absMinute } from '@/lib/match'
import type { Period, EventType } from '@/lib/types'

export const maxDuration = 60

const SYSTEM = `Είσαι ο αρθρογράφος του Salonicup, ερασιτεχνικού πρωταθλήματος ποδοσφαίρου στη Θεσσαλονίκη.

ΥΦΟΣ
Αθλητικό ρεπορτάζ με πολύ χιούμορ και καλαμπούρι. Πειραχτικό αλλά ΠΟΤΕ προσβλητικό.
Οι ατάκες βγαίνουν από τα ίδια τα γεγονότα του αγώνα — παρομοιώσεις, ευρήματα, μικρά πειράγματα.

Παραδείγματα από προηγούμενα κείμενα:
- "μέσα σε λίγα λεπτά είχαν βάλει την ES Pylaia να κυνηγάει την μπάλα σαν… Pokémon Go"
- "το γήπεδο μετατράπηκε σε πάρτι των Spartans, με DJ τον Πάνο Γρηγοριάδη"
- "ατάκες από τον πάγκο που θύμιζαν περισσότερο stand-up παρά οδηγίες προπονητή"
- "Η Master League ξεκίνησε με… καταιγισμό γκολ"

ΚΑΝΟΝΕΣ
- Γράψε ΜΟΝΟ την περιγραφή, 2-3 παραγράφους.
- Χρησιμοποίησε ΑΠΟΚΛΕΙΣΤΙΚΑ τα γεγονότα που σου δίνονται. ΜΗΝ εφευρίσκεις γκολ, παίκτες, λεπτά ή φάσεις.
- Ανάφερε τα λεπτά όπως δίνονται (π.χ. 30+2', 47').
- Ξεχώρισε τα ημίχρονα. Αν υπήρξε παράταση ή πέναλτι, δώσε τους βάρος.
- Μην γράψεις τίτλο, ούτε λίστες σκόρερ/ασίστ/MVP — μπαίνουν αυτόματα.
- Καθαρό κείμενο. Χωρίς markdown, χωρίς bullet points.`

export async function POST(req: Request) {
  try {
    const { matchId } = await req.json()
    if (!matchId) {
      return NextResponse.json({ error: 'Λείπει το matchId' }, { status: 400 })
    }

    // Μόνο speakers
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'speaker'].includes(profile.role)) {
      return NextResponse.json({ error: 'Χωρίς δικαίωμα' }, { status: 403 })
    }

    const db = createAdminClient()

    const { data: match } = await db
      .from('matches')
      .select(`
        *,
        team_a_data:team_a(team_id, name),
        team_b_data:team_b(team_id, name),
        league:league_id(name)
      `)
      .eq('match_id', matchId)
      .single()

    if (!match) {
      return NextResponse.json({ error: 'Ο αγώνας δεν βρέθηκε' }, { status: 404 })
    }

    const { data: events } = await db
      .from('events')
      .select('*, player:player_id(full_name)')
      .eq('match_id', matchId)

    const list = events ?? []
    const nameA = match.team_a_data?.name ?? 'Ομάδα Α'
    const nameB = match.team_b_data?.name ?? 'Ομάδα Β'
    const teamName = (id: string) => (id === match.team_a ? nameA : nameB)

    /* ── Χρονολόγιο για το AI ── */
    const timeline = [...list]
      .sort((a, b) =>
        absMinute(a.period as Period, a.minute) -
        absMinute(b.period as Period, b.minute))
      .map(e => {
        const P   = PERIODS.find(p => p.id === (e.period ?? 'H1'))!
        const cfg = EVENTS[e.event_type as EventType]
        const when = e.period === 'PEN'
          ? 'διαδικασία πέναλτι'
          : `${fmtMinute(e.period as Period, e.minute)} (${P.label})`
        return `${when} — ${cfg.label}: ${e.player?.full_name ?? '—'} (${teamName(e.team_id)})`
      })
      .join('\n')

    /* ── Λίστες σκόρερ / ασίστ ── */
    const tally = (teamId: string, type: EventType) => {
      const m = new Map<string, number>()
      list
        .filter(e => e.team_id === teamId && e.event_type === type && e.period !== 'PEN')
        .forEach(e => {
          const n = e.player?.full_name ?? '—'
          m.set(n, (m.get(n) ?? 0) + 1)
        })
      const out = [...m.entries()].map(([n, c]) => `${n} ${c}`).join(', ')
      return out || '[Δεν καταγράφηκαν]'
    }

    /* ── MVP: χειροκίνητος αν έχει οριστεί, αλλιώς υπολογισμένος ── */
    let mvp = '—'
    if (match.mvp_player_id) {
      const { data: p } = await db.from('players')
        .select('full_name').eq('player_id', match.mvp_player_id).single()
      mvp = p?.full_name ?? '—'
    } else {
      const pts = new Map<string, number>()
      list.forEach(e => {
        if (e.period === 'PEN') return
        if (e.event_type !== 'GOAL' && e.event_type !== 'ASSIST') return
        const n = e.player?.full_name ?? '—'
        pts.set(n, (pts.get(n) ?? 0) + (e.event_type === 'GOAL' ? 2 : 1))
      })
      const top = [...pts.entries()].sort((a, b) => b[1] - a[1])[0]
      mvp = top ? top[0] : '—'
    }

    const hasPens = match.pens_team_a > 0 || match.pens_team_b > 0

    const prompt = `ΔΟΜΗ ΑΓΩΝΑ: 30'+30'. Παράταση 5'. Πέναλτι 5-5 αν χρειαστεί.

ΔΕΔΟΜΕΝΑ
Διοργάνωση: ${match.league?.name ?? '—'}, Αγωνιστική ${match.round}
Τελικό σκορ: ${nameA} ${match.goals_team_a}-${match.goals_team_b} ${nameB}${
  hasPens ? `\nΠέναλτι: ${match.pens_team_a}-${match.pens_team_b}` : ''
}

ΦΑΣΕΙΣ
${timeline || '(δεν καταγράφηκαν φάσεις)'}`

    /* ── Δωρεάν αυτόματο ρεπορτάζ (χωρίς AI): πλούσιο, με χιούμορ ── */
    function buildAutoNarrative(): string {
      const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]
      const ga = match.goals_team_a, gb = match.goals_team_b
      const pa = match.pens_team_a, pb = match.pens_team_b
      const total = ga + gb, diff = Math.abs(ga - gb)
      const league = match.league?.name ?? 'το πρωτάθλημα'
      const winner = ga > gb ? nameA : gb > ga ? nameB : null
      const winnerId = ga > gb ? match.team_a : gb > ga ? match.team_b : null
      const penWinner = pa > pb ? nameA : nameB

      const character = total >= 8
        ? pick([
            'ένα ατελείωτο πάρτι γκολ που θύμιζε περισσότερο μπάσκετ παρά ποδόσφαιρο',
            'καταιγισμό τερμάτων που κούρασε ακόμα και τον πίνακα του σκορ',
            'γκολ-θέαμα που θα ζήλευε και highlights του NBA'])
        : total >= 5
        ? pick(['ένα πλούσιο σε γκολ ματς', 'μπόλικη δράση και τέρματα', 'ένα ανοιχτό, θεαματικό παιχνίδι'])
        : total <= 2
        ? pick([
            'μια σφιχτή, σχεδόν σκακιστική αναμέτρηση',
            'ένα ματς όπου τα γκολ ήταν είδος πολυτελείας',
            'παιχνίδι υπομονής, με τις άμυνες να κλέβουν την παράσταση'])
        : pick(['ένα ζωντανό ματς με εναλλαγές', 'μια αναμέτρηση με νεύρο και ρυθμό'])

      const opener = pick([
        `Αυλαία στην ${match.round}η αγωνιστική ${league}. `,
        `${league}, ${match.round}η αγωνιστική, και το γήπεδο είχε κέφια. `,
        `Στην ${match.round}η αγωνιστική ${league}, `])
      const intro = `${opener}${nameA} και ${nameB} μας χάρισαν ${character}, ` +
        `με τελικό ${nameA} ${ga}-${gb} ${nameB}${hasPens ? ` (και πέναλτι ${pa}-${pb})` : ''}.`

      // Ανίχνευση ανατροπής (ο νικητής βρέθηκε πίσω στο σκορ)
      const ordered = [...list]
        .filter(e => (e.event_type === 'GOAL' || e.event_type === 'OWN') && e.period !== 'PEN')
        .sort((a, b) => absMinute(a.period as Period, a.minute) - absMinute(b.period as Period, b.minute))
      let sa = 0, sb = 0, winnerWasBehind = false
      for (const e of ordered) {
        const forA = (e.event_type === 'GOAL' && e.team_id === match.team_a) ||
                     (e.event_type === 'OWN' && e.team_id === match.team_b)
        if (forA) sa++; else sb++
        if (winnerId === match.team_a && sa < sb) winnerWasBehind = true
        if (winnerId === match.team_b && sb < sa) winnerWasBehind = true
      }
      const comeback = winner && winnerWasBehind
        ? pick([
            `Και μάλιστα από θέση πίσω στο σκορ: ανατροπή που θα τη συζητούν για καιρό.`,
            `Η ${winner} το γύρισε από χαμένο, γιατί το ποδόσφαιρο αγαπάει τα σίκουελ.`])
        : null

      const HALF: Record<string, string> = {
        H1: 'Στο πρώτο μέρος', H2: 'Στην επανάληψη', ET: 'Στην παράταση',
      }
      const halves = (['H1', 'H2', 'ET'] as Period[]).map(pid => {
        const goals = ordered.filter(e => (e.period ?? 'H1') === pid)
        if (!goals.length) return null
        const parts = goals.map(e =>
          `${fmtMinute(pid, e.minute)} ${e.player?.full_name ?? '—'} ` +
          `(${teamName(e.team_id)}${e.event_type === 'OWN' ? ', αυτογκόλ' : ''})`)
        const lead = pick(['με σκόρερ', 'όπου βρήκαν δίχτυα οι', 'με τα γκολ να ανήκουν στους', 'και πρωταγωνιστές στο σκορ τους'])
        return `${HALF[pid]} ${lead}: ${parts.join(' · ')}.`
      }).filter(Boolean)

      // Έξτρα χρώμα: αυτογκόλ, κόκκινες
      const flavor: string[] = []
      if (list.some(e => e.event_type === 'OWN'))
        flavor.push(pick([
          'Δεν έλειψε και το αυτογκόλ, γιατί το ποδόσφαιρο έχει και τα σουρεαλιστικά του.',
          'Μπήκε στη μέση κι ένα αυτογκόλ, απλώς για να μη λείπει η πινελιά τρέλας.']))
      if (list.some(e => e.event_type === 'RED'))
        flavor.push(pick([
          'Υπήρξε και ένταση με αποβολή, που άλλαξε τις ισορροπίες.',
          'Η κόκκινη κάρτα έβαλε κι αυτή το χεράκι της στο σενάριο.']))

      // Πρωταγωνιστής σκόρερ
      const gc = new Map<string, number>()
      list.filter(e => e.event_type === 'GOAL' && e.period !== 'PEN')
        .forEach(e => { const n = e.player?.full_name ?? '—'; gc.set(n, (gc.get(n) ?? 0) + 1) })
      const top = [...gc.entries()].sort((a, b) => b[1] - a[1])[0]
      const highlight = top && top[1] >= 3
        ? pick([`Χατ-τρικ για τον ${top[0]} — μόνος του «καθάρισε» το ματς.`,
                `Ο ${top[0]} πήρε τη μπάλα στο σπίτι του: ${top[1]} γκολ και υπογραφή.`])
        : top && top[1] === 2
        ? pick([`Ο ${top[0]} με δύο γκολ ήταν ο πιο επικίνδυνος στο γήπεδο.`,
                `Νταμπλ για τον ${top[0]}, που θύμισε σε όλους γιατί τον φοβούνται.`])
        : null

      const closing = winner
        ? (diff >= 4
            ? pick([`Μονόλογος της ${winner}, που δεν άφησε περιθώρια ούτε για ευγενική αντίσταση.`,
                    `Η ${winner} έκανε περίπατο και γύρισε σπίτι με το καλάθι γεμάτο.`])
            : diff === 1
            ? pick([`Θρίλερ που κρίθηκε στη λεπτομέρεια, με τη ${winner} να το παίρνει στο νήμα.`,
                    `Η ${winner} κράτησε γερά τα νεύρα της και πήρε μια νίκη-ανάσα.`])
            : pick([`Στο τέλος, η ${winner} πανηγύρισε δίκαια το τρίποντο.`,
                    `Καθαρή δουλειά για τη ${winner}, που πήρε αυτό που ήθελε.`]))
        : hasPens
        ? pick([`Και επειδή το κανονικό δεν έφτανε, η υπόθεση πήγε στη λοταρία των πέναλτι, με τη ${penWinner} να έχει πιο σταθερό χέρι.`,
                `Στα πέναλτι, εκεί που η καρδιά χτυπάει σαν ταμπούρλο, η ${penWinner} κράτησε την ψυχραιμία της.`])
        : pick([`Δίκαιη μοιρασιά, με τις δύο ομάδες να τα «σπάνε» φιλικά στο ${ga}-${gb}.`,
                `Ισοπαλία που άφησε και τους δύο με ένα «κρίμα» στα χείλη.`])

      return [intro, comeback, ...halves, ...flavor, highlight, closing]
        .filter(Boolean).join('\n\n')
    }

    let body: string
    if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      })
      body = msg.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('\n')
        .trim()
    } else {
      body = buildAutoNarrative()
    }

    const report = [
      body,
      '',
      `Σκόρερς ${nameA}`,
      tally(match.team_a, 'GOAL'),
      '',
      `Ασίστ ${nameA}`,
      tally(match.team_a, 'ASSIST'),
      '',
      `Σκόρερς ${nameB}`,
      tally(match.team_b, 'GOAL'),
      '',
      `Ασίστ ${nameB}`,
      tally(match.team_b, 'ASSIST'),
      '',
      `MVP: ${mvp}`,
      ...(hasPens
        ? ['', `Πέναλτι: ${nameA} ${match.pens_team_a} – ${match.pens_team_b} ${nameB}`]
        : []),
    ].join('\n')

    return NextResponse.json({ report })
  } catch (e: any) {
    console.error('report error', e)
    return NextResponse.json(
      { error: e.message ?? 'Σφάλμα δημιουργίας κειμένου' },
      { status: 500 }
    )
  }
}

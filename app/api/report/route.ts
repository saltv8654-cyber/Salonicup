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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Λείπει το ANTHROPIC_API_KEY στο Vercel' }, { status: 503 })
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const body = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('\n')
      .trim()

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

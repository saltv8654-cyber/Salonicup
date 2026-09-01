import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Crest, BottomNav, Empty, Watermark, LiveDot } from '@/app/ui'
import { fmtDay, fmtTime } from '@/lib/time'

export const revalidate = 30

const GROUPS = 'ABCDEFGHIJKL'.split('')

type Row = {
  team_id: string; name: string; logo: string | null
  p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number
}

export default async function CupPage() {
  const supabase = createClient()

  const { data: cup } = await supabase.from('leagues')
    .select('league_id, name, season, logo_url').eq('format', 'cup').maybeSingle()

  if (!cup) {
    return (
      <div className="min-h-screen bg-pitch pb-20">
        <Header title="Κύπελλο" />
        <div className="px-3.5"><Empty>Δεν έχει στηθεί κύπελλο ακόμα.</Empty></div>
        <BottomNav />
      </div>
    )
  }

  const [{ data: cupTeams }, { data: teams }, { data: matches }] = await Promise.all([
    supabase.from('cup_teams').select('team_id, grp, seed').eq('cup_id', cup.league_id),
    supabase.from('teams').select('team_id, name, logo_url'),
    supabase.from('matches')
      .select('match_id, team_a, team_b, round, cup_group, stage, match_status, goals_team_a, goals_team_b, match_date, team_a_data:team_a(name,logo_url), team_b_data:team_b(name,logo_url)')
      .eq('league_id', cup.league_id),
  ])

  const teamById = Object.fromEntries((teams ?? []).map(t => [t.team_id, t]))
  const done = (m: any) => ['Played', 'Forfeit'].includes(m.match_status)

  // Βαθμολογία ανά όμιλο
  function groupTable(grp: string): Row[] {
    const members = (cupTeams ?? []).filter(c => c.grp === grp)
    const rows: Record<string, Row> = {}
    for (const c of members) {
      const t = teamById[c.team_id]
      rows[c.team_id] = { team_id: c.team_id, name: t?.name ?? '—', logo: t?.logo_url ?? null,
        p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }
    }
    for (const m of matches ?? []) {
      if (m.cup_group !== grp || !done(m)) continue
      const A = rows[m.team_a], B = rows[m.team_b]
      if (!A || !B) continue
      const ga = m.goals_team_a ?? 0, gb = m.goals_team_b ?? 0
      A.p++; B.p++; A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga
      if (ga > gb) { A.w++; B.l++; A.pts += 3 }
      else if (ga < gb) { B.w++; A.l++; B.pts += 3 }
      else { A.d++; B.d++; A.pts++; B.pts++ }
    }
    return Object.values(rows).map(r => ({ ...r, gd: r.gf - r.ga }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name, 'el'))
  }

  const activeGroups = GROUPS.filter(g => (cupTeams ?? []).some(c => c.grp === g))

  return (
    <div className="min-h-screen bg-pitch pb-20">
      <Header title={cup.name} sub={cup.season ?? undefined} logo={cup.logo_url} />

      {!activeGroups.length ? (
        <div className="px-3.5"><Empty>Η κλήρωση δεν έχει γίνει ακόμα.</Empty></div>
      ) : (
        <div className="px-3.5 pt-1 flex flex-col gap-4">
          {activeGroups.map(g => {
            const table = groupTable(g)
            const gmatches = (matches ?? []).filter(m => m.cup_group === g)
              .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.match_date ?? '').localeCompare(b.match_date ?? ''))
            return (
              <div key={g} className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                <div className="px-3.5 py-2 bg-lit/[0.10] flex items-center gap-2">
                  <span className="text-[13px] font-extrabold text-lit">Όμιλος {g}</span>
                </div>

                {/* Βαθμολογία ομίλου */}
                <div className="px-1.5 py-1">
                  <div className="grid items-center [grid-template-columns:16px_1fr_22px_22px_28px_28px] gap-0
                    px-2 pb-1 text-[8px] font-extrabold text-dim tracking-wide">
                    <span>#</span><span className="pl-6">ΟΜΑΔΑ</span>
                    <span className="text-center">Α</span><span className="text-center">Β</span>
                    <span className="text-center">ΔΤ</span><span className="text-center text-lit">ΒΑΘ</span>
                  </div>
                  {table.map((r, i) => (
                    <Link key={r.team_id} href={`/team/${r.team_id}`}
                      className={`grid items-center [grid-template-columns:16px_1fr_22px_22px_28px_28px] gap-0
                        px-2 py-1.5 rounded-lg active:bg-[#1C1C22] ${i < 2 ? 'bg-lit/[0.06]' : ''}`}>
                      <span className={`text-[11px] font-extrabold tnum ${i < 2 ? 'text-lit' : 'text-dim'}`}>{i + 1}</span>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Crest url={r.logo} name={r.name} size={18} />
                        <span className="text-[11.5px] text-chalk truncate">{r.name}</span>
                      </span>
                      <span className="text-center text-[11px] text-dim tnum">{r.p}</span>
                      <span className="text-center text-[11px] text-silver tnum">{r.w}</span>
                      <span className={`text-center text-[11px] tnum ${r.gd > 0 ? 'text-lit' : r.gd < 0 ? 'text-[#9E5148]' : 'text-dim'}`}>
                        {r.gd > 0 ? `+${r.gd}` : r.gd}
                      </span>
                      <span className="text-center text-[12px] font-extrabold text-chalk tnum">{r.pts}</span>
                    </Link>
                  ))}
                </div>

                {/* Αγώνες ομίλου */}
                <div className="border-t border-chalk/[0.05] flex flex-col">
                  {gmatches.map(m => {
                    const live = m.match_status === 'Live'
                    const dn = done(m)
                    return (
                      <Link key={m.match_id} href={`/match/${m.match_id}`}
                        className="grid items-center [grid-template-columns:1fr_52px_1fr] gap-2 px-3 py-2
                          border-t border-chalk/[0.04] first:border-t-0 active:bg-[#1C1C22]">
                        <span className="text-[11px] text-chalk truncate text-right">{(m.team_a_data as any)?.name}</span>
                        <span className="text-center">
                          {live || dn
                            ? <span className="text-[12px] font-extrabold text-chalk tnum">{m.goals_team_a}-{m.goals_team_b}</span>
                            : <span className="text-[10.5px] font-bold text-silver tnum">{m.match_date ? fmtTime(m.match_date) : 'VS'}</span>}
                          {live && <span className="block mt-0.5"><LiveDot /></span>}
                        </span>
                        <span className="text-[11px] text-chalk truncate">{(m.team_b_data as any)?.name}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <p className="text-[10px] text-off text-center">
            Προκρίνονται οι 2 πρώτοι κάθε ομίλου + οι 8 καλύτεροι 3οι → φάση των 32.
          </p>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function Header({ title, sub, logo }: { title: string; sub?: string; logo?: string | null }) {
  return (
    <header className="relative px-4 pt-6 pb-4 overflow-hidden">
      <div className="absolute -right-6 -top-4 w-32 h-36"><Watermark opacity={0.05} /></div>
      <div className="relative flex items-center gap-3">
        {logo ? <img src={logo} alt="" className="w-9 h-9 object-contain" /> : <span className="text-3xl">🏆</span>}
        <div>
          <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
          <h1 className="text-2xl font-extrabold text-chalk tracking-tight">{title}</h1>
          {sub && <p className="text-[10.5px] text-dim mt-0.5">{sub}</p>}
        </div>
      </div>
    </header>
  )
}

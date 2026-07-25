import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Crest, LiveDot, SectionLabel } from '@/app/ui'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const supabase = createClient()

  const [leagues, teams, players, matches, live] = await Promise.all([
    supabase.from('leagues').select('league_id', { count: 'exact', head: true }),
    supabase.from('teams').select('team_id', { count: 'exact', head: true }),
    supabase.from('players').select('player_id', { count: 'exact', head: true }),
    supabase.from('matches').select('match_id', { count: 'exact', head: true }),
    supabase.from('matches')
      .select(`
        match_id, round, goals_team_a, goals_team_b,
        team_a_data:team_a(name, logo_url),
        team_b_data:team_b(name, logo_url),
        league:league_id(name)
      `)
      .eq('match_status', 'Live'),
  ])

  const stats = [
    { l: 'Πρωταθλήματα', v: leagues.count ?? 0, href: '/admin/leagues' },
    { l: 'Ομάδες',       v: teams.count ?? 0,   href: '/admin/teams' },
    { l: 'Παίκτες',      v: players.count ?? 0, href: '/admin/players' },
    { l: 'Αγώνες',       v: matches.count ?? 0, href: '/admin/matches' },
  ]

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-2 mb-6">
        {stats.map(s => (
          <Link key={s.l} href={s.href}
            className="bg-turf rounded-xl p-4 border border-chalk/[0.05]
              active:bg-[#1C1C22]">
            <div className="text-2xl font-extrabold text-lit leading-none tnum">{s.v}</div>
            <div className="text-[10px] text-dim font-bold mt-1.5 tracking-[0.06em]
              uppercase">{s.l}</div>
          </Link>
        ))}
      </div>

      {(live.data?.length ?? 0) > 0 && (
        <>
          <SectionLabel live>Σε εξέλιξη</SectionLabel>
          <div className="flex flex-col gap-1.5 mb-6">
            {live.data!.map((m: any) => (
              <Link key={m.match_id} href={`/speaker/${m.match_id}`}
                className="bg-turf rounded-xl px-3.5 py-3 border border-live/35
                  active:bg-[#1C1C22]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9.5px] text-dim font-bold">
                    {m.league?.name} · Αγ. {m.round}
                  </span>
                  <LiveDot />
                </div>
                <div className="flex items-center gap-2">
                  <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={22} />
                  <span className="flex-1 text-[13px] font-semibold text-chalk truncate">
                    {m.team_a_data?.name}
                  </span>
                  <span className="text-lg font-extrabold text-chalk tnum">
                    {m.goals_team_a}<span className="text-off mx-1">·</span>{m.goals_team_b}
                  </span>
                  <span className="flex-1 text-[13px] font-semibold text-chalk truncate
                    text-right">
                    {m.team_b_data?.name}
                  </span>
                  <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={22} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Γρήγορες ενέργειες</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {[
          { l: '+ Πρωτάθλημα', href: '/admin/leagues' },
          { l: '+ Ομάδα',      href: '/admin/teams' },
          { l: '+ Παίκτης',    href: '/admin/players' },
          { l: '+ Αγώνας',     href: '/admin/matches' },
          { l: '+ Γήπεδο',     href: '/admin/venues' },
          { l: '+ Speaker',    href: '/admin/users' },
        ].map(a => (
          <Link key={a.l} href={a.href}
            className="bg-chalk/[0.04] rounded-xl py-3 text-center text-[12.5px]
              font-bold text-silver active:bg-chalk/[0.08]">
            {a.l}
          </Link>
        ))}
      </div>
    </div>
  )
}

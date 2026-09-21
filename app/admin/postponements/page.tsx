import { createClient } from '@/lib/supabase/server'
import { Empty, Postponements } from '@/app/ui'
import { MAX_POSTPONEMENTS } from '@/lib/match'

export const dynamic = 'force-dynamic'

export default async function AdminPostponements() {
  const supabase = createClient()
  const [{ data: leagues }, { data: teams }] = await Promise.all([
    supabase.from('leagues').select('league_id, name').eq('is_cup', false).order('sort_order'),
    supabase.from('teams').select('team_id, name, league_id, postponements').eq('active', true).order('name'),
  ])

  const byLeague = new Map<string, any[]>()
  for (const t of teams ?? []) {
    if (!byLeague.has(t.league_id)) byLeague.set(t.league_id, [])
    byLeague.get(t.league_id)!.push(t)
  }
  // Ταξινόμηση: πρώτα όσες έχουν περισσότερες αναβολές
  for (const list of byLeague.values())
    list.sort((a, b) => (b.postponements ?? 0) - (a.postponements ?? 0) || a.name.localeCompare(b.name, 'el'))

  const groups = (leagues ?? []).filter(l => (byLeague.get(l.league_id) ?? []).length)

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold text-chalk mb-3">⛔ Αναβολές ανά πρωτάθλημα</h1>

      {!groups.length ? <Empty>Δεν υπάρχουν ομάδες.</Empty> : (
        <div className="flex flex-col gap-5">
          {groups.map(l => {
            const list = byLeague.get(l.league_id)!
            const total = list.reduce((s, t) => s + (t.postponements ?? 0), 0)
            return (
              <div key={l.league_id}>
                <div className="flex items-baseline justify-between mb-1.5 px-1">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-lit">{l.name}</p>
                  <span className="text-[10px] text-dim font-bold">σύνολο {total}</span>
                </div>
                <div className="bg-turf rounded-xl border border-chalk/[0.05] overflow-hidden">
                  {list.map((t, i) => (
                    <div key={t.team_id}
                      className={`flex items-center justify-between px-3.5 py-2.5 ${i ? 'border-t border-chalk/[0.05]' : ''}`}>
                      <span className="text-[13px] font-semibold text-chalk truncate">{t.name}</span>
                      <Postponements n={t.postponements ?? 0} max={MAX_POSTPONEMENTS} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

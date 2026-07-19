'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Crest, Avatar, Empty } from '@/app/ui'

const GR: Record<string, string> = {
  ά:'α', έ:'ε', ή:'η', ί:'ι', ΐ:'ι', ϊ:'ι', ό:'ο', ύ:'υ', ϋ:'υ', ΰ:'υ', ώ:'ω',
}
const norm = (s: string) =>
  (s ?? '').toLowerCase().replace(/[άέήίΐϊόύϋΰώ]/g, c => GR[c] ?? c).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

interface TeamRow {
  team_id: string; name: string; logo_url: string | null
  league: { name: string } | null
}
interface PlayerRow {
  player_id: string; full_name: string; number: number | null
  photo_url: string | null; team: { name: string; logo_url: string | null } | null
}

export default function SearchView({ teams, players }: {
  teams: TeamRow[]; players: PlayerRow[]
}) {
  const [q, setQ] = useState('')
  const query = norm(q.trim())

  const { foundTeams, foundPlayers } = useMemo(() => {
    if (!query) return { foundTeams: [], foundPlayers: [] }
    return {
      foundTeams: teams
        .filter(t => norm(t.name).includes(query))
        .slice(0, 20),
      foundPlayers: players
        .filter(p => norm(p.full_name).includes(query) ||
          (p.team && norm(p.team.name).includes(query)))
        .slice(0, 40),
    }
  }, [query, teams, players])

  const nothing = query && !foundTeams.length && !foundPlayers.length

  return (
    <>
      <header className="px-4 pt-6 pb-3">
        <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold">Salonicup</p>
        <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Αναζήτηση</h1>
      </header>

      <div className="px-3.5 pb-3">
        <div className="flex items-center gap-2 bg-turf rounded-xl px-3.5 py-3
          border border-chalk/[0.08] focus-within:border-lit/40">
          <span className="text-dim text-sm">🔎</span>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Ομάδα ή παίκτης…"
            className="flex-1 bg-transparent text-chalk text-[14px] outline-none placeholder:text-off"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-dim text-sm px-1">✕</button>
          )}
        </div>
      </div>

      <div className="px-3.5 py-2">
        {!query ? (
          <p className="text-xs text-off text-center py-10">
            Γράψε όνομα ομάδας ή παίκτη για αναζήτηση.
          </p>
        ) : nothing ? (
          <Empty>Κανένα αποτέλεσμα για «{q}».</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {foundTeams.length > 0 && (
              <div>
                <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-dim mb-2 px-1">
                  Ομάδες
                </p>
                <div className="flex flex-col gap-[3px]">
                  {foundTeams.map(t => (
                    <Link key={t.team_id} href={`/team/${t.team_id}`}
                      className="flex items-center gap-3 bg-turf rounded-lg px-3 py-2.5
                        border border-chalk/[0.04] active:bg-[#1C1C22]">
                      <Crest url={t.logo_url} name={t.name} size={30} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold text-chalk truncate">{t.name}</p>
                        {t.league && <p className="text-[10px] text-dim truncate">{t.league.name}</p>}
                      </div>
                      <span className="text-dim text-sm">›</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {foundPlayers.length > 0 && (
              <div>
                <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-dim mb-2 px-1">
                  Παίκτες
                </p>
                <div className="flex flex-col gap-[3px]">
                  {foundPlayers.map(p => (
                    <Link key={p.player_id} href={`/player/${p.player_id}`}
                      className="flex items-center gap-3 bg-turf rounded-lg px-3 py-2.5
                        border border-chalk/[0.04] active:bg-[#1C1C22]">
                      <Avatar url={p.photo_url} name={p.full_name} size={30} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold text-chalk truncate">{p.full_name}</p>
                        {p.team && <p className="text-[10px] text-dim truncate">{p.team.name}</p>}
                      </div>
                      {p.number != null && (
                        <span className="text-[12px] font-extrabold text-dim tnum">#{p.number}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

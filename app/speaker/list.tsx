'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Crest, LiveDot, Empty } from '@/app/ui'
import LiveClock from '@/app/live-clock'
import { fmtDateTime as fmt } from '@/lib/time'

/** Πεζά + χωρίς τόνους, για αναζήτηση ανεξάρτητα από τονισμό/κεφαλαία. */
function norm(s?: string | null) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const byDateAsc  = (a: any, b: any) => (a.match_date ?? '').localeCompare(b.match_date ?? '')
const byDateDesc = (a: any, b: any) => (b.match_date ?? '').localeCompare(a.match_date ?? '')
const PAST = ['Played', 'Forfeit']
type Tab = 'past' | 'live' | 'next'
const catOf = (m: any): Tab =>
  m.match_status === 'Live' ? 'live' : PAST.includes(m.match_status) ? 'past' : 'next'

export default function SpeakerList({ matches }: { matches: any[] }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>(() =>
    matches.some(m => m.match_status === 'Live') ? 'live' : 'next')

  const filtered = useMemo(() => {
    const needle = norm(q.trim())
    if (!needle) return matches
    return matches.filter(m => {
      const hay = norm([
        m.team_a_data?.name, m.team_b_data?.name, m.league?.name,
        m.venue?.name, m.field, m.round != null ? `αγ ${m.round}` : '',
      ].filter(Boolean).join(' '))
      return hay.includes(needle)
    })
  }, [matches, q])

  const groups = useMemo(() => ({
    past: filtered.filter(m => catOf(m) === 'past').sort(byDateDesc), // πιο πρόσφατοι πρώτα
    live: filtered.filter(m => catOf(m) === 'live').sort(byDateAsc),
    next: filtered.filter(m => catOf(m) === 'next').sort(byDateAsc),  // πλησιέστεροι πρώτα
  }), [filtered])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'past', label: 'Προηγούμενοι' },
    { id: 'live', label: 'Σε εξέλιξη' },
    { id: 'next', label: 'Επόμενοι' },
  ]
  const shown = groups[tab]

  return (
    <div className="px-3.5">
      {/* Αναζήτηση */}
      <div className="relative mb-3">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-silver text-sm">🔎</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Αναζήτηση ομάδας, πρωταθλήματος…"
          className="w-full bg-turf rounded-xl pl-10 pr-9 py-3 text-chalk text-[13.5px]
            outline-none border border-chalk/[0.07] focus:border-lit/50 placeholder:text-off"
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Καθαρισμός"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md
              bg-chalk/[0.06] text-dim text-[11px] grid place-items-center active:bg-chalk/10">
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-turf rounded-xl p-[3px] mb-4 border border-chalk/[0.05]">
        {TABS.map(t => {
          const on = tab === t.id
          const n = groups[t.id].length
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg
                text-[12.5px] font-bold transition-colors
                ${on ? 'bg-brand text-chalk' : 'text-dim'}`}>
              {t.id === 'live' && n > 0 && <LiveDot />}
              {t.label}
              {n > 0 && (
                <span className={`text-[10px] font-extrabold tnum ${on ? 'text-chalk/70' : 'text-off'}`}>
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {shown.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {shown.map(m => <Row key={m.match_id} m={m} />)}
        </div>
      ) : (
        <Empty>
          {q ? 'Κανένας αγώνας δεν ταιριάζει.'
            : tab === 'live' ? 'Κανένας αγώνας σε εξέλιξη.'
            : tab === 'past' ? 'Δεν υπάρχουν ολοκληρωμένοι αγώνες.'
            : 'Δεν υπάρχουν προγραμματισμένοι αγώνες.'}
        </Empty>
      )}
    </div>
  )
}

function Row({ m }: { m: any }) {
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)
  const postponed = m.match_status === 'Postponed'
  const statusLabel = postponed ? 'ΑΝΑΒΛΗΘΗΚΕ' : done ? 'ΤΕΛΙΚΟ' : fmt(m.match_date)
  const place = [m.venue?.name, m.field].filter(Boolean).join(' · ')

  return (
    <Link href={`/speaker/${m.match_id}`}
      className={`block bg-turf rounded-xl px-3.5 py-3 border active:bg-[#1C1C22]
        ${live ? 'border-live/35' : 'border-chalk/[0.05]'}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[9.5px] text-dim font-bold">
          {m.league?.name} · Αγ. {m.round}
        </span>
        {live ? (
          <span className="flex items-center gap-1.5">
            <LiveClock period={m.clock_period} startedAt={m.clock_started_at} withHalf
              className="text-[11px] font-extrabold text-live tnum" />
            <LiveDot />
          </span>
        ) : (
          <span className="text-[9.5px] text-dim font-bold">{statusLabel}</span>
        )}
      </div>

      <div className="grid items-center gap-2 [grid-template-columns:1fr_52px_1fr]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Crest url={m.team_a_data?.logo_url} name={m.team_a_data?.name} size={26} />
          <span className="text-sm font-semibold text-chalk truncate">
            {m.team_a_data?.name}
          </span>
        </div>

        <div className="text-center">
          {live || done ? (
            <span className="text-[22px] font-extrabold text-chalk tnum leading-none">
              {m.goals_team_a}<span className="text-off mx-0.5">·</span>{m.goals_team_b}
            </span>
          ) : (
            <span className="text-xs font-extrabold text-off">VS</span>
          )}
        </div>

        <div className="flex items-center gap-2.5 min-w-0 justify-end">
          <span className="text-sm font-semibold text-chalk truncate text-right">
            {m.team_b_data?.name}
          </span>
          <Crest url={m.team_b_data?.logo_url} name={m.team_b_data?.name} size={26} />
        </div>
      </div>

      {place && (
        <p className="text-[9.5px] text-off text-center mt-2.5 pt-2
          border-t border-chalk/[0.05]">{place}</p>
      )}
    </Link>
  )
}

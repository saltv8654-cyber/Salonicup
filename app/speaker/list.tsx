'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Crest, LiveDot, SectionLabel, Empty } from '@/app/ui'
import LiveClock from '@/app/live-clock'
import { fmtDateTime as fmt } from '@/lib/time'

/** Πεζά + χωρίς τόνους, για αναζήτηση ανεξάρτητα από τονισμό/κεφαλαία. */
function norm(s?: string | null) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const byDateAsc = (a: any, b: any) => (a.match_date ?? '').localeCompare(b.match_date ?? '')

export default function SpeakerList({ matches }: { matches: any[] }) {
  const [q, setQ] = useState('')

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

  // Σε εξέλιξη πάνω-πάνω· όλοι οι υπόλοιποι σε χρονολογική σειρά (παλιότερος → νεότερος)
  const live = filtered.filter(m => m.match_status === 'Live').sort(byDateAsc)
  const rest = filtered.filter(m => m.match_status !== 'Live').sort(byDateAsc)

  return (
    <div className="px-3.5">
      {/* Αναζήτηση */}
      <div className="relative mb-4">
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

      {live.length > 0 && (
        <Group label="Σε εξέλιξη" live>{live.map(m => <Row key={m.match_id} m={m} />)}</Group>
      )}
      {rest.length > 0 && (
        <Group label="Όλοι οι αγώνες">{rest.map(m => <Row key={m.match_id} m={m} />)}</Group>
      )}

      {!filtered.length && (
        <Empty>{q ? 'Κανένας αγώνας δεν ταιριάζει.' : 'Δεν υπάρχουν αγώνες.'}</Empty>
      )}
    </div>
  )
}

function Group({ label, live, children }: {
  label: string; live?: boolean; children: React.ReactNode
}) {
  return (
    <section className="mb-5">
      <SectionLabel live={live}>{label}</SectionLabel>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
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

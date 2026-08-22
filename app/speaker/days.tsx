'use client'
import { useMemo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { Crest, LiveDot, Empty } from '@/app/ui'
import LiveClock from '@/app/live-clock'
import { athensDateKey, fmtDay, fmtTime, fmtDateTime } from '@/lib/time'

/**
 * Ροδέλα ημερών για τον σπίκερ: «Σήμερα» στο κέντρο, προηγούμενες μέρες
 * αριστερά, επόμενες δεξιά — κεντράρει αυτόματα στο σήμερα.
 */
export default function SpeakerDays({ matches, isAdmin }: {
  matches: any[]; isAdmin?: boolean
}) {
  const now = new Date()
  const todayKey = athensDateKey(now.toISOString())
  const yestKey = athensDateKey(new Date(now.getTime() - 86400000).toISOString())
  const tomKey = athensDateKey(new Date(now.getTime() + 86400000).toISOString())

  // Ομαδοποίηση ανά ημέρα (μόνο όσοι έχουν ημερομηνία)· χωρίς ημερομηνία → «none»
  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, any[]>()
    const und: any[] = []
    for (const m of matches) {
      if (!m.match_date) { und.push(m); continue }
      const k = athensDateKey(m.match_date)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(m)
    }
    return { byDay: map, undated: und }
  }, [matches])

  // Αριθμός σκέλους (1ο/2ο) για διπλά playoff (QF/SF), ανά ζευγάρι+φάση+πρωτάθλημα
  const legNoById = useMemo(() => {
    const groups = new Map<string, any[]>()
    for (const m of matches) {
      if (!m.stage || m.stage === 'Final') continue
      const pair = [m.team_a, m.team_b].slice().sort().join('-')
      const k = `${m.league_id}:${m.stage}:${pair}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(m)
    }
    const out = new Map<string, number>()
    for (const arr of groups.values()) {
      // QF/SF είναι πάντα διπλά — ο πρώτος (κατά ημ/νία) είναι Α΄ ακόμη κι αν λείπει ο Β΄
      arr.sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
      arr.forEach((m, i) => out.set(m.match_id, i + 1))
    }
    return out
  }, [matches])

  // Το «Σήμερα» υπάρχει πάντα στη ροδέλα
  if (!byDay.has(todayKey)) byDay.set(todayKey, [])
  const days = [...byDay.keys()].sort()

  const [selected, setSelected] = useState<string>(() =>
    byDay.has(todayKey) ? todayKey
    : days.find(d => d >= todayKey) ?? days[days.length - 1] ?? todayKey)

  const dayLabel = (key: string) =>
    key === todayKey ? 'Σήμερα'
    : key === yestKey ? 'Χθες'
    : key === tomKey ? 'Αύριο'
    : fmtDay(byDay.get(key)![0]?.match_date ?? undefined)

  const tabs = days.map(k => ({ key: k, label: dayLabel(k) }))
  if (undated.length) tabs.push({ key: 'none', label: 'Χωρίς ημ/νία' })

  const list = (selected === 'none' ? undated : (byDay.get(selected) ?? []))
    .slice().sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))

  // Κεντράρισμα του ενεργού tab στο mount / όταν αλλάζει
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = barRef.current
    const el = c?.querySelector('[data-on="1"]') as HTMLElement | null
    if (c && el) c.scrollLeft = el.offsetLeft - (c.clientWidth - el.clientWidth) / 2
  }, [selected])

  return (
    <div>
      {/* Ροδέλα ημερών */}
      <div ref={barRef}
        className="flex gap-1 px-3.5 pb-3 overflow-x-auto border-b border-chalk/[0.06]
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(t => {
          const on = t.key === selected
          const n = t.key === 'none' ? undated.length : (byDay.get(t.key)?.length ?? 0)
          return (
            <button key={t.key} onClick={() => setSelected(t.key)} data-on={on ? '1' : undefined}
              className={`shrink-0 px-3.5 py-2 text-[12.5px] font-bold whitespace-nowrap
                border-b-2 -mb-[1px] transition-colors flex items-center gap-1.5
                ${on ? 'text-lit border-lit' : 'text-dim border-transparent'}`}>
              {t.label}
              {n > 0 && (
                <span className={`text-[10px] font-extrabold tnum ${on ? 'text-lit/70' : 'text-off'}`}>
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="px-3.5 pt-4">
        {list.length ? (
          <div className="flex flex-col gap-1.5">
            {list.map(m => <Row key={m.match_id} m={m} leg={legNoById.get(m.match_id)} />)}
          </div>
        ) : (
          <Empty>
            {isAdmin ? 'Δεν υπάρχουν αγώνες αυτή τη μέρα.'
              : 'Δεν έχεις αγώνες αυτή τη μέρα.'}
          </Empty>
        )}
      </div>
    </div>
  )
}

const STAGE_LBL: Record<string, string> = { QF: 'Προημιτελικά', SF: 'Ημιτελικά', Final: 'Τελικός' }

function Row({ m, leg }: { m: any; leg?: number }) {
  const live = m.match_status === 'Live'
  const done = ['Played', 'Forfeit'].includes(m.match_status)
  const postponed = m.match_status === 'Postponed'
  const statusLabel = postponed ? 'ΑΝΑΒΛΗΘΗΚΕ' : done ? 'ΤΕΛΙΚΟ' : fmtDateTime(m.match_date)
  const place = [m.venue?.name, m.field].filter(Boolean).join(' · ')
  const isPlayoff = !!m.stage && !!STAGE_LBL[m.stage]
  const legLbl = leg ? (leg === 1 ? 'Α΄ αγώνας' : leg === 2 ? 'Β΄ αγώνας' : `${leg}ο σκέλος`) : ''

  return (
    <Link href={`/speaker/${m.match_id}`}
      className={`block bg-turf rounded-xl px-3.5 py-3 border active:bg-[#1C1C22]
        ${live ? 'border-live/35' : isPlayoff ? 'border-[#E8B923]/35' : 'border-chalk/[0.05]'}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[9.5px] text-dim font-bold flex items-center gap-1.5">
          {isPlayoff && (
            <span className="text-[8.5px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              style={{ color: '#E8B923', background: 'rgba(232,185,35,0.14)' }}>
              🏆 PLAYOFF
            </span>
          )}
          {m.league?.name}{isPlayoff ? ` · ${STAGE_LBL[m.stage]}${legLbl ? ` · ${legLbl}` : ''}` : m.round != null ? ` · Αγ. ${m.round}` : ''}
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
            <span className="text-xs font-extrabold text-off">
              {m.match_date ? fmtTime(m.match_date) : 'VS'}
            </span>
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

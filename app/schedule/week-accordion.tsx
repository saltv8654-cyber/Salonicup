'use client'
import { useState } from 'react'

export type Week = { key: string; label: string; free: number; count: number; body: React.ReactNode }

/** Πτυσσόμενες εβδομάδες — η πρώτη ανοιχτή, οι υπόλοιπες ανοίγουν με πάτημα. */
export default function WeekAccordion({ weeks }: { weeks: Week[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(weeks[0] ? { [weeks[0].key]: true } : {})
  return (
    <div className="flex flex-col gap-2">
      {weeks.map(w => {
        const isOpen = !!open[w.key]
        return (
          <div key={w.key}>
            <button onClick={() => setOpen(o => ({ ...o, [w.key]: !o[w.key] }))}
              className="w-full flex items-center gap-2 px-3.5 py-3 rounded-xl bg-turf
                border border-chalk/[0.06] active:bg-[#1C1C22]">
              <span className="text-[13px] font-extrabold text-chalk flex-1 text-left">{w.label}</span>
              <span className="text-[9px] text-dim font-bold">{w.count} αγ.</span>
              {w.free > 0 && <span className="text-[9px] font-extrabold text-lit bg-lit/[0.12] px-2 py-[2px] rounded-full">{w.free} ελεύθ.</span>}
              <span className="text-dim text-sm w-4 text-center">{isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen && <div className="flex flex-col gap-4 mt-2 mb-1">{w.body}</div>}
          </div>
        )
      })}
    </div>
  )
}

'use client'
import { useState } from 'react'

/** Κρύβει τις επόμενες εβδομάδες πίσω από κουμπί «Επόμενοι αγώνες». */
export default function MoreWeeks({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl bg-turf border border-chalk/[0.08]
          text-lit text-[13px] font-extrabold active:bg-[#1C1C22]">
        Επόμενοι αγώνες ({count}) ▾
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {children}
      <button onClick={() => setOpen(false)}
        className="w-full py-2.5 rounded-xl bg-turf border border-chalk/[0.06] text-dim text-[12px] font-bold">
        Λιγότερα ▴
      </button>
    </div>
  )
}

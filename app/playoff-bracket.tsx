import { Crest } from './ui'

export type BSide = {
  name?: string
  logo?: string | null
  seed?: number
  agg?: number | null
  win?: boolean
  ph?: string          // placeholder όταν ο νικητής δεν έχει κριθεί ακόμη
}
export type BTie = { a: BSide; b: BSide }

function Row({ s }: { s: BSide }) {
  if (s.ph) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-2 min-h-[34px]">
        <span className="w-4 shrink-0" />
        <span className="text-[10.5px] italic text-off truncate">{s.ph}</span>
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-1.5 px-2 py-2 min-h-[34px]
      ${s.win ? 'bg-gradient-to-r from-lit/25 to-transparent' : ''}`}>
      <span className="w-4 text-[9px] font-extrabold text-dim tnum text-center shrink-0">
        {s.seed ?? ''}
      </span>
      <Crest url={s.logo} name={s.name} size={18} />
      <span className={`flex-1 min-w-0 text-[11.5px] font-semibold truncate
        ${s.win ? 'text-lit' : 'text-chalk'}`}>
        {s.name ?? '—'}
      </span>
      <span className={`text-[12px] font-extrabold tnum shrink-0 ${s.win ? 'text-lit' : 'text-silver'}`}>
        {s.agg ?? '–'}
      </span>
    </div>
  )
}

function TieCard({ tie, title }: { tie: BTie; title: string }) {
  return (
    <div className="w-[152px] bg-turf rounded-xl border border-chalk/[0.07] overflow-hidden shrink-0">
      <div className="text-[8px] font-extrabold text-dim tracking-[0.14em] text-center py-1 bg-chalk/[0.04]">
        {title}
      </div>
      <Row s={tie.a} />
      <div className="h-px bg-chalk/[0.06] mx-2" />
      <Row s={tie.b} />
    </div>
  )
}

function CupCenter({ tie, champion }: { tie: BTie; champion?: BSide }) {
  return (
    <div className="w-[172px] rounded-2xl overflow-hidden shrink-0
      border-2 border-[#e8b923]/45 bg-gradient-to-b from-[#2b2410] to-turf
      shadow-[0_10px_30px_rgba(232,185,35,0.12)]">
      <div className="flex flex-col items-center pt-3 pb-1.5">
        <span className="text-[34px] leading-none">🏆</span>
        <span className="text-[8px] font-extrabold tracking-[0.2em] text-[#e8b923] mt-1">ΤΕΛΙΚΟΣ</span>
      </div>
      <Row s={tie.a} />
      <div className="h-px bg-[#e8b923]/20 mx-2" />
      <Row s={tie.b} />
      <div className="text-center py-1.5 bg-[#e8b923]/12 border-t border-[#e8b923]/20">
        {champion?.name
          ? <span className="text-[11px] font-extrabold text-[#f0d264]">🏆 {champion.name}</span>
          : <span className="text-[9px] font-bold tracking-[0.14em] text-[#e8b923]/70">ΠΡΩΤΑΘΛΗΤΗΣ</span>}
      </div>
    </div>
  )
}

export default function PlayoffBracket({
  qf18, qf45, qf27, qf36, sfTop, sfBot, fin, champion,
}: {
  qf18: BTie; qf45: BTie; qf27: BTie; qf36: BTie
  sfTop: BTie; sfBot: BTie; fin: BTie; champion?: BSide
}) {
  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="min-w-[560px] mx-auto grid grid-cols-3 gap-x-3 gap-y-4 items-center"
        style={{ maxWidth: 560 }}>
        {/* Πάνω σειρά: 1-8 · ΗΜΙΤΕΛΙΚΟΣ · 4-5 */}
        <TieCard tie={qf18} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 1v8" />
        <TieCard tie={sfTop} title="ΗΜΙΤΕΛΙΚΟΣ" />
        <TieCard tie={qf45} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 4v5" />

        {/* Μεσαία σειρά: κύπελλο στο κέντρο */}
        <span />
        <CupCenter tie={fin} champion={champion} />
        <span />

        {/* Κάτω σειρά: 2-7 · ΗΜΙΤΕΛΙΚΟΣ · 3-6 */}
        <TieCard tie={qf27} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 2v7" />
        <TieCard tie={sfBot} title="ΗΜΙΤΕΛΙΚΟΣ" />
        <TieCard tie={qf36} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 3v6" />
      </div>
      <p className="text-[9px] text-off text-center mt-2">
        Διπλά παιχνίδια · περνά η ομάδα με την καλύτερη συνολική διαφορά τερμάτων
      </p>
    </div>
  )
}

import { Crest } from './ui'

export type BSide = {
  name?: string
  logo?: string | null
  seed?: number
  scores?: (number | null)[]   // σκορ ανά παιχνίδι (2 για QF/SF, 1 για τελικό)
  win?: boolean
  ph?: string                  // placeholder όταν ο νικητής δεν έχει κριθεί ακόμη
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
  const scores = s.scores?.length ? s.scores : [null]
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
      <span className="flex items-center gap-0.5 shrink-0">
        {scores.map((v, i) => (
          <span key={i} className={`w-[15px] text-center text-[12px] font-extrabold tnum
            ${i > 0 ? 'border-l border-chalk/[0.1]' : ''}
            ${s.win ? 'text-lit' : 'text-silver'}`}>
            {v ?? '–'}
          </span>
        ))}
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
      {/* Μακρόστενο «χωνί»: προημιτελικοί στις 4 γωνίες, ημιτελικοί μαζεύουν προς το κέντρο,
          κύπελλο στη μέση (ΗΜΙΤΕΛΙΚΟΣ 1 κάτω από τους πάνω, ΗΜΙΤΕΛΙΚΟΣ 2 πάνω από τους κάτω). */}
      <div className="mx-auto grid gap-x-2 gap-y-3"
        style={{ maxWidth: 500, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div style={{ gridColumn: 1, gridRow: 1 }}><TieCard tie={qf18} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 1v8" /></div>
        <div style={{ gridColumn: 3, gridRow: 1, justifySelf: 'end' }}><TieCard tie={qf45} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 4v5" /></div>

        <div style={{ gridColumn: 2, gridRow: 2, justifySelf: 'center' }}><TieCard tie={sfTop} title="ΗΜΙΤΕΛΙΚΟΣ 1" /></div>
        <div style={{ gridColumn: 2, gridRow: 3, justifySelf: 'center' }}><CupCenter tie={fin} champion={champion} /></div>
        <div style={{ gridColumn: 2, gridRow: 4, justifySelf: 'center' }}><TieCard tie={sfBot} title="ΗΜΙΤΕΛΙΚΟΣ 2" /></div>

        <div style={{ gridColumn: 1, gridRow: 5 }}><TieCard tie={qf27} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 2v7" /></div>
        <div style={{ gridColumn: 3, gridRow: 5, justifySelf: 'end' }}><TieCard tie={qf36} title="ΠΡΟΗΜΙΤΕΛΙΚΟΣ · 3v6" /></div>
      </div>
      <p className="text-[9px] text-off text-center mt-2">
        Προημ./Ημιτ.: δύο στήλες = τα 2 παιχνίδια · περνά η καλύτερη συνολική διαφορά τερμάτων · Τελικός: 1 παιχνίδι
      </p>
    </div>
  )
}

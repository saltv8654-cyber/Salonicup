'use client'
import { slotCoords } from '@/lib/formations'

type P = { full_name?: string; number?: number | null; photo_url?: string | null }

export function shortName(n?: string) {
  if (!n) return ''
  const parts = n.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : n
}

function PitchLines() {
  return (
    <svg viewBox="0 0 100 133" preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full">
      <g fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.6">
        <rect x="2" y="2" width="96" height="129" />
        <line x1="2" y1="66.5" x2="98" y2="66.5" />
        <circle cx="50" cy="66.5" r="11" />
        <rect x="30" y="2" width="40" height="15" />
        <rect x="30" y="116" width="40" height="15" />
      </g>
    </svg>
  )
}

type Tally = { g: number; a: number; y: number; r: number }

/** Γήπεδο με διάταξη. Διαδραστικό (onSlot) για τον σπίκερ, αλλιώς μόνο εμφάνιση. */
export default function LineupPitch({ formation, line, players, onSlot, accent = '#E05B1F', notes, stats, bg, borderColor }: {
  formation: string
  line: (string | null)[]
  players: Record<string, P>
  onSlot?: (index: number) => void
  accent?: string
  notes?: Record<string, string>
  stats?: Record<string, Tally>
  bg?: string
  borderColor?: string
}) {
  const coords = slotCoords(formation)
  return (
    <div className="relative w-full rounded-2xl overflow-hidden"
      style={{ aspectRatio: '3 / 4', background: bg ?? 'linear-gradient(#1f3d24, #14291a)',
        border: `1px solid ${borderColor ?? 'rgba(255,255,255,0.08)'}` }}>
      <PitchLines />
      {coords.map((c, i) => {
        const pid = line[i]
        const p = pid ? players[pid] : null
        const note = pid ? notes?.[pid] : undefined
        const st = pid ? stats?.[pid] : undefined
        return (
          <div key={i}
            role={onSlot ? 'button' : undefined}
            onClick={onSlot ? () => onSlot(i) : undefined}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 select-none"
            style={{
              left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: 104,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              cursor: onSlot ? 'pointer' : 'default',
            }}>
            <div className="relative w-12 h-12">
              <span
                className={`w-12 h-12 rounded-full grid place-items-center text-[14px] font-extrabold
                  overflow-hidden ${p ? 'text-white border-2' : 'border-2 border-dashed border-white/45 text-white/70'}`}
                style={p ? { background: accent, borderColor: 'rgba(255,255,255,0.9)' } : undefined}>
                {p
                  ? (p.photo_url
                      ? <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                      : (p.number ?? (p.full_name?.[0] ?? '?')))
                  : (onSlot ? '+' : '')}
              </span>
              {/* Αριθμός φανέλας — σήμα στη γωνία όταν υπάρχει φωτό (αλλιώς φαίνεται μέσα στον κύκλο) */}
              {p && p.photo_url && p.number != null && (
                <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-[3px] rounded-full
                  grid place-items-center text-[10px] font-black text-white leading-none
                  border-2 border-white/85 tabular-nums" style={{ background: '#0b0b0e' }}>
                  {p.number}
                </span>
              )}
            </div>
            {p && (
              <span className="text-[10px] font-semibold text-white text-center leading-tight
                px-1 py-0.5 rounded bg-black/55 max-w-[104px]">
                {p.full_name}
              </span>
            )}
            {p && st && (st.g || st.a || st.y || st.r) ? (
              <span className="flex items-center gap-1 text-[9px] font-extrabold text-white
                leading-none px-1 py-0.5 rounded bg-black/55">
                {st.g > 0 && <span>⚽{st.g > 1 ? st.g : ''}</span>}
                {st.a > 0 && <span>🅰{st.a > 1 ? st.a : ''}</span>}
                {st.y > 0 && <span>🟨</span>}
                {st.r > 0 && <span>🟥</span>}
              </span>
            ) : null}
            {p && note && (
              <span className="text-[9px] font-semibold text-lit text-center leading-tight
                px-1 rounded bg-black/55 max-w-[104px]">
                📝 {note}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

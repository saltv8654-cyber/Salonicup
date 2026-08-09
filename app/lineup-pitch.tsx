'use client'
import { useId } from 'react'
import { slotCoords } from '@/lib/formations'

type P = {
  full_name?: string; number?: number | null; photo_url?: string | null
  kit_primary?: string | null; kit_secondary?: string | null; kit_pattern?: string | null
  team?: { kit_primary?: string | null; kit_secondary?: string | null; kit_pattern?: string | null } | null
}

export function shortName(n?: string) {
  if (!n) return ''
  const parts = n.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : n
}

function idealText(hex?: string | null) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#141414' : '#fff'
}

const JERSEY_D = 'M35 8 L18 18 L8 38 L22 48 L33 40 L33 92 L67 92 L67 40 L78 48 L92 38 L82 18 L65 8 L58 15 C53 19 47 19 42 15 Z'

/** Φανέλα ομάδας (χρώμα/μοτίβο) με το νούμερο. */
function Jersey({ primary, secondary, pattern, number, size }: {
  primary: string; secondary?: string | null; pattern?: string | null; number?: number | null; size: number
}) {
  const id = 'jp' + useId().replace(/:/g, '')
  let fill: string = primary
  let defs: React.ReactNode = null
  if (pattern === 'halves' && secondary) {
    fill = `url(#${id})`
    defs = <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="50%" stopColor={primary} /><stop offset="50%" stopColor={secondary} />
    </linearGradient></defs>
  } else if (pattern === 'stripes' && secondary) {
    fill = `url(#${id})`
    const cols = [primary, secondary]; const stops: React.ReactNode[] = []
    for (let k = 0; k < 6; k++) stops.push(
      <stop key={'a' + k} offset={`${(k / 6) * 100}%`} stopColor={cols[k % 2]} />,
      <stop key={'b' + k} offset={`${((k + 1) / 6) * 100}%`} stopColor={cols[k % 2]} />)
    defs = <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0">{stops}</linearGradient></defs>
  }
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        {defs}
        <path d={JERSEY_D} fill={fill} stroke="#fff" strokeWidth={3} strokeLinejoin="round" />
      </svg>
      {number != null && (
        <span style={{ position: 'absolute', inset: 0, top: size * 0.14, display: 'grid', placeItems: 'center' }}>
          <span style={{ minWidth: size * 0.42, height: size * 0.42, padding: `0 ${size * 0.05}px`,
            borderRadius: size * 0.24, background: 'rgba(0,0,0,0.42)', display: 'grid', placeItems: 'center',
            fontSize: size * 0.3, fontWeight: 800, color: '#fff' }}>{number}</span>
        </span>
      )}
    </span>
  )
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

/** Γήπεδο με διάταξη. Διαδραστικό (onSlot) για τον σπίκερ, αλλιώς μόνο εμφάνιση.
 *  Κάθε παίκτης εμφανίζεται με τη φανέλα της ομάδας του (χρώμα/μοτίβο). */
export default function LineupPitch({ formation, line, players, onSlot, accent = '#E05B1F', notes, stats, bg, borderColor, kit }: {
  formation: string
  line: (string | null)[]
  players: Record<string, P>
  onSlot?: (index: number) => void
  accent?: string
  notes?: Record<string, string>
  stats?: Record<string, Tally>
  bg?: string
  borderColor?: string
  kit?: { primary?: string | null; secondary?: string | null; pattern?: string | null }
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
        const kp = p?.kit_primary ?? p?.team?.kit_primary ?? kit?.primary ?? accent
        const ks = p?.kit_secondary ?? p?.team?.kit_secondary ?? kit?.secondary ?? null
        const kpat = p?.kit_pattern ?? p?.team?.kit_pattern ?? kit?.pattern ?? 'solid'
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
            {p ? (
              <Jersey primary={kp} secondary={ks} pattern={kpat} number={p.number} size={54} />
            ) : (
              <span className="w-12 h-12 rounded-full grid place-items-center border-2 border-dashed
                border-white/45 text-white/70 text-[14px] font-extrabold">
                {onSlot ? '+' : ''}
              </span>
            )}
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

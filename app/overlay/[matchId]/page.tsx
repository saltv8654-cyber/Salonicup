'use client'
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'
import { useNow } from '@/lib/hooks/useNow'
import { clockLabel, clockHalf } from '@/lib/clock'

/** Διάφανο scoreboard για OBS (Browser Source).
 *  Παράμετροι: ?pos=tl|tr|bl|br  ?scale=1.2 */
export default function Overlay() {
  const { matchId } = useParams()
  const params = useSearchParams()
  const { match } = useLiveMatch(matchId as string)
  const now = useNow(1000)

  const scale = parseFloat(params.get('scale') || '1') || 1
  const pos = params.get('pos') || 'tl'

  // Διάφανο φόντο για το OBS
  useEffect(() => {
    const b = document.body.style.background
    const h = document.documentElement.style.background
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    return () => { document.body.style.background = b; document.documentElement.style.background = h }
  }, [])

  if (!match) return null

  const clk = clockLabel(match.clock_period, match.clock_started_at, now)
  const half = clockHalf(match.clock_period)
  const posStyle: React.CSSProperties =
    pos === 'tr' ? { top: 24, right: 24 }
    : pos === 'bl' ? { bottom: 24, left: 24 }
    : pos === 'br' ? { bottom: 24, right: 24 }
    : { top: 24, left: 24 }
  const origin = pos.includes('r') ? 'right top' : 'left top'

  return (
    <div style={{ position: 'fixed', ...posStyle, transform: `scale(${scale})`, transformOrigin: origin }}>
      <div className="flex items-stretch rounded-xl overflow-hidden shadow-2xl"
        style={{ fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }}>
        <Team name={match.team_a_data?.name} logo={match.team_a_data?.logo_url} />
        <div className="flex items-center justify-center px-4 bg-black/85 text-white
          text-[30px] font-extrabold leading-none tnum">
          {match.goals_team_a}<span className="mx-2 opacity-40">·</span>{match.goals_team_b}
        </div>
        <Team name={match.team_b_data?.name} logo={match.team_b_data?.logo_url} reverse />
        {clk && (
          <div className="flex flex-col items-center justify-center px-3 min-w-[62px]
            text-white" style={{ background: '#E05B1F' }}>
            {half && <span className="text-[9.5px] font-bold leading-none opacity-90">{half}</span>}
            <span className="text-[17px] font-extrabold leading-none tnum mt-0.5">{clk}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Team({ name, logo, reverse }: { name?: string; logo?: string | null; reverse?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-4 text-white ${reverse ? 'flex-row-reverse' : ''}`}
      style={{ background: 'rgba(14,24,48,0.95)' }}>
      {logo && <img src={logo} alt="" className="w-7 h-7 object-contain shrink-0" />}
      <span className="text-[19px] font-bold uppercase whitespace-nowrap tracking-tight">{name}</span>
    </div>
  )
}

'use client'
import { useParams } from 'next/navigation'
import { useLiveMatch } from '@/lib/hooks/useLiveMatch'

// Χρώμα accent ανά πρωτάθλημα (ίδια λογική με το scoreboard)
type T = { deep: string; pink: string }
const LEAGUE_THEMES: { re: RegExp; t: T }[] = [
  { re: /liga/i,    t: { deep: '#201e04', pink: '#FFE000' } },
  { re: /master/i,  t: { deep: '#041d12', pink: '#2BD46E' } },
  { re: /trophy|skg/i, t: { deep: '#200503', pink: '#F0463A' } },
  { re: /fantasy/i, t: { deep: '#05121f', pink: '#38A9E8' } },
  { re: /legend/i,  t: { deep: '#140a20', pink: '#9B51E0' } },
  { re: /summer/i,  t: { deep: '#0d0620', pink: '#37E0FF' } },
]
const DEFAULT_T: T = { deep: '#1a0d2a', pink: '#FF7A2F' }
function leagueTheme(name?: string | null): T {
  if (name) for (const { re, t } of LEAGUE_THEMES) if (re.test(name)) return t
  return DEFAULT_T
}

export default function InterviewOverlay() {
  const { matchId } = useParams<{ matchId: string }>()
  const { match } = useLiveMatch(matchId)
  if (!match) return null

  const side: string | null = match.interview_side ?? null   // 'a' | 'b' | null
  const a = match.team_a_data, b = match.team_b_data
  const th = leagueTheme(match.league?.name)

  const guest = side === 'a' ? a : side === 'b' ? b : null
  const player: string | null = (match.interview_name && String(match.interview_name).trim()) || null
  const show = !!guest

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', fontFamily: 'system-ui, sans-serif' }}>
      {/* Lower-third κάτω-αριστερά — εμφανίζεται/κρύβεται με slide */}
      <div style={{
        position: 'absolute', left: 90, bottom: 90, display: 'flex', flexDirection: 'column', gap: 0,
        transform: show ? 'translateX(0)' : 'translateX(-140%)',
        opacity: show ? 1 : 0, transition: 'transform .5s cubic-bezier(.2,.9,.2,1), opacity .4s',
      }}>
        {/* Κορυφή: FLASH INTERVIEW (kicker) + κόκκινο ΖΩΝΤΑΝΑ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <span style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: '1px',
            textShadow: '0 4px 18px rgba(0,0,0,.6)' }}>
            FLASH INTERVIEW
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(10,10,16,.82)', padding: '7px 14px', borderRadius: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff2d2d',
              boxShadow: '0 0 12px #ff2d2d' }} />
            <span style={{ fontSize: 22, fontWeight: 900, color: '#ff2d2d', letterSpacing: '2px' }}>
              ΖΩΝΤΑΝΑ
            </span>
          </span>
        </div>

        {/* Μπάρα: όνομα παίκτη (μεγάλο) + ομάδα από κάτω */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16,
          background: 'rgba(10,10,16,.82)', borderLeft: `10px solid ${th.pink}`,
          padding: '14px 34px 14px 22px', borderRadius: 8, alignSelf: 'flex-start',
          boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}>
          {guest?.logo_url && (
            <img src={guest.logo_url} alt="" width={62} height={62}
              style={{ width: 62, height: 62, objectFit: 'contain' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: player ? 46 : 40, fontWeight: 800, color: '#fff',
              textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {player ?? guest?.name ?? ''}
            </span>
            {player && (
              <span style={{ fontSize: 24, fontWeight: 700, color: th.pink, textTransform: 'uppercase',
                letterSpacing: '1px', whiteSpace: 'nowrap' }}>
                {guest?.name ?? ''}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

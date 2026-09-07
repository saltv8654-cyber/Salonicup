'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function Crest({ url, name, size }: { url?: string | null; name?: string; size: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 8, display: 'grid', placeItems: 'center',
      overflow: 'hidden', background: 'rgba(255,255,255,0.06)', flex: 'none' }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: size * 0.5, color: '#8a8a93' }}>{(name?.[0] ?? '?').toUpperCase()}</span>}
    </span>
  )
}

export default function DrawOverlay() {
  const { leagueId } = useParams()
  const supabase = useRef(createClient())
  const [league, setLeague] = useState<any>(null)
  const [teams, setTeams] = useState<Record<string, any>>({})
  const [slots, setSlots] = useState<Record<number, string | null>>({})

  useEffect(() => {
    const lid = leagueId as string
    supabase.current.from('leagues').select('name, logo_url, season').eq('league_id', lid).single()
      .then(({ data }) => setLeague(data))
    supabase.current.from('teams').select('team_id, name, logo_url').eq('league_id', lid)
      .then(({ data }) => setTeams(Object.fromEntries((data ?? []).map((t: any) => [t.team_id, t]))))
    supabase.current.from('draw_slots').select('slot, team_id').eq('league_id', lid)
      .then(({ data }) => {
        const m: Record<number, string | null> = {}
        for (const r of data ?? []) m[r.slot] = r.team_id
        setSlots(m)
      })

    const ch = supabase.current.channel(`draw-${lid}`)
      .on('broadcast', { event: 'draw' }, ({ payload }: any) => {
        if (payload?.slots) setSlots(payload.slots)
      })
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [leagueId])

  const entries = Object.entries(slots)
    .filter(([, v]) => v)
    .map(([s, v]) => ({ slot: Number(s), team: teams[v as string] }))
    .sort((a, b) => a.slot - b.slot)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', overflow: 'hidden',
      fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif' }}>
      <style>{`@keyframes drIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}`}</style>

      {/* Δεξιά μισή οθόνη — αριστερά μένει διάφανη για την κάμερα */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '100%',
        display: 'flex', flexDirection: 'column', padding: '46px 48px',
        background: 'linear-gradient(90deg, rgba(11,11,14,0) 0%, rgba(11,11,14,0.78) 12%, rgba(11,11,14,0.92) 100%)' }}>

        {/* Κεφαλίδα πρωταθλήματος */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
          {league?.logo_url && <img src={league.logo_url} alt="" style={{ width: 74, height: 74, objectFit: 'contain' }} />}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 6, color: '#F5782E' }}>SALONICUP · ΚΛΗΡΩΣΗ</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1.05 }}>{league?.name ?? ''}</div>
          </div>
        </div>

        {/* Λίστα θέση → ομάδα */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          {entries.length === 0 ? (
            <div style={{ fontSize: 24, color: '#8a8a93' }}>Αναμονή κλήρωσης…</div>
          ) : entries.map(e => (
            <div key={e.slot} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
              borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: '4px solid #F5782E', animation: 'drIn .4s cubic-bezier(.2,.9,.25,1)' }}>
              <span style={{ width: 46, height: 46, borderRadius: 10, background: 'rgba(245,120,46,0.16)',
                display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 900, color: '#F5782E', flex: 'none' }}>
                {e.slot}
              </span>
              <Crest url={e.team?.logo_url} name={e.team?.name} size={44} />
              <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.team?.name ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

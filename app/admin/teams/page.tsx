'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Crest, Loading, Empty, Postponements } from '@/app/ui'
import { Modal, Field, Select, SaveBtn, LogoUpload } from '../ui'
import { MAX_POSTPONEMENTS } from '@/lib/match'
import toast from 'react-hot-toast'
import type { Team, League } from '@/lib/types'

export default function AdminTeams() {
  const supabase = createClient()
  const [rows, setRows]       = useState<any[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [filter, setFilter]   = useState('')
  const [load, setLoad]       = useState(true)
  const [open, setOpen]       = useState(false)
  const [edit, setEdit]       = useState<Team | null>(null)
  const [view, setView]       = useState<'list' | 'status'>('list')
  const [counts, setCounts]   = useState<Record<string, number>>({})

  async function fetchRows() {
    const [t, l, p] = await Promise.all([
      supabase.from('teams').select('*, league:league_id(name)').order('name'),
      supabase.from('leagues').select('*').order('sort_order'),
      supabase.from('players').select('team_id').eq('active', true),
    ])
    setRows(t.data ?? [])
    setLeagues(l.data ?? [])
    const c: Record<string, number> = {}
    for (const pl of p.data ?? []) c[pl.team_id] = (c[pl.team_id] ?? 0) + 1
    setCounts(c)
    setLoad(false)
  }

  async function toggleFee(t: any) {
    const { error } = await supabase.from('teams')
      .update({ fee_paid: !t.fee_paid }).eq('team_id', t.team_id)
    if (error) return toast.error('Λείπει η στήλη fee_paid; τρέξε το SQL')
    fetchRows()
  }

  useEffect(() => { fetchRows() }, [])

  async function remove(id: string) {
    if (!confirm('Διαγραφή ομάδας; Θα σβηστούν και οι παίκτες της.')) return
    const { error } = await supabase.from('teams').delete().eq('team_id', id)
    if (error) return toast.error('Δεν διαγράφηκε')
    toast.success('Διαγράφηκε'); fetchRows()
  }

  /** Αναβολή: +1 στην ομάδα που τη ζήτησε */
  async function bumpPostpone(t: Team, delta: number) {
    const next = Math.max(0, (t.postponements ?? 0) + delta)
    const { error } = await supabase.from('teams')
      .update({ postponements: next }).eq('team_id', t.team_id)
    if (error) return toast.error('Δεν ενημερώθηκε')
    if (next >= 3) toast('3η αναβολή — αποβολή!', { icon: '🚫' })
    fetchRows()
  }

  if (load) return <Loading />

  const filtered = filter ? rows.filter(r => r.league_id === filter) : rows

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-extrabold text-chalk">Ομάδες</h1>
        <button onClick={() => { setEdit(null); setOpen(true) }}
          className="px-4 py-2 rounded-lg bg-gradient-to-b from-lit to-brand
            text-white text-[12.5px] font-extrabold">+ Νέα</button>
      </div>

      {/* Λίστα / Κατάσταση ετοιμότητας */}
      <div className="flex bg-turf rounded-xl p-[3px] border border-chalk/[0.05] mb-3">
        {([['list', 'Λίστα'], ['status', '📋 Κατάσταση']] as const).map(([v, lbl]) => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold transition-colors
              ${view === v ? 'bg-brand text-chalk' : 'text-dim'}`}>{lbl}</button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        <button onClick={() => setFilter('')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold
            ${!filter ? 'bg-brand text-chalk' : 'bg-turf text-dim'}`}>
          Όλες
        </button>
        {leagues.map(l => (
          <button key={l.league_id} onClick={() => setFilter(l.league_id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold
              whitespace-nowrap ${filter === l.league_id
                ? 'bg-brand text-chalk' : 'bg-turf text-dim'}`}>
            {l.name}
          </button>
        ))}
      </div>

      {view === 'status' ? (
        <StatusView teams={filtered} counts={counts} onToggleFee={toggleFee} />
      ) : !filtered.length ? <Empty>Δεν υπάρχουν ομάδες.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(t => (
            <div key={t.team_id}
              className="bg-turf rounded-xl px-3.5 py-3 flex items-center gap-3
                border border-chalk/[0.05]">
              <Crest url={t.logo_url} name={t.name} size={34} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-chalk truncate">{t.name}</p>
                <p className="text-[10.5px] text-dim mt-0.5">{t.league?.name}</p>
              </div>

              {/* Αναβολές */}
              <div className="flex items-center gap-1.5">
                <button onClick={() => bumpPostpone(t, -1)}
                  className="w-6 h-6 rounded-md bg-chalk/[0.05] text-dim
                    text-sm grid place-items-center">−</button>
                <Postponements n={t.postponements ?? 0} max={MAX_POSTPONEMENTS} />
                <button onClick={() => bumpPostpone(t, 1)}
                  className="w-6 h-6 rounded-md bg-chalk/[0.05] text-silver
                    text-sm grid place-items-center">+</button>
              </div>

              <button onClick={() => { setEdit(t); setOpen(true) }}
                className="px-3 py-2 rounded-lg bg-chalk/[0.05] text-silver
                  text-[11px] font-bold">Επεξ.</button>
              <button onClick={() => remove(t.team_id)}
                className="px-2.5 py-2 rounded-lg bg-danger/15 text-danger
                  text-[11px] font-bold">✕</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <TeamForm row={edit} leagues={leagues}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); fetchRows() }} />
      )}
    </div>
  )
}

/** Πίνακας ετοιμότητας: Λογότυπο · Ρόστερ · Κόστος συμμετοχής (ανά πρωτάθλημα). */
function StatusView({ teams, counts, onToggleFee }: {
  teams: any[]; counts: Record<string, number>; onToggleFee: (t: any) => void
}) {
  const MIN_ROSTER = 7
  if (!teams.length) return <Empty>Δεν υπάρχουν ομάδες.</Empty>

  // Ομαδοποίηση ανά πρωτάθλημα
  const byLeague = new Map<string, { name: string; list: any[] }>()
  for (const t of teams) {
    const k = t.league_id
    if (!byLeague.has(k)) byLeague.set(k, { name: t.league?.name ?? '—', list: [] })
    byLeague.get(k)!.list.push(t)
  }

  const Chip = ({ ok, children, onClick }: { ok: boolean; children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} disabled={!onClick}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-extrabold shrink-0"
      style={{
        background: ok ? 'rgba(47,168,79,0.16)' : 'rgba(224,86,60,0.14)',
        color: ok ? '#4FbF6a' : '#e0563c',
      }}>
      {ok ? '✓' : '✕'} {children}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      {[...byLeague.values()].map((g, gi) => {
        const done = g.list.filter(t => t.logo_url && (counts[t.team_id] ?? 0) >= MIN_ROSTER && t.fee_paid).length
        return (
          <div key={gi}>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <span className="text-[13px] font-extrabold text-lit">{g.name}</span>
              <span className="text-[10px] text-dim font-bold">{done}/{g.list.length} έτοιμες</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {g.list.map(t => {
                const n = counts[t.team_id] ?? 0
                return (
                  <div key={t.team_id} className="bg-turf rounded-xl px-3 py-2.5 flex items-center gap-2.5
                    border border-chalk/[0.05]">
                    <Crest url={t.logo_url} name={t.name} size={28} />
                    <span className="flex-1 min-w-0 text-[13px] font-bold text-chalk truncate">{t.name}</span>
                    <Chip ok={!!t.logo_url}>Λογότυπο</Chip>
                    <Chip ok={n >= MIN_ROSTER}>Ρόστερ {n}</Chip>
                    <Chip ok={!!t.fee_paid} onClick={() => onToggleFee(t)}>Κόστος</Chip>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <p className="text-[10px] text-off text-center">
        Πάτησε «Κόστος» για να το σημειώσεις πληρωμένο. Ρόστερ πράσινο από {MIN_ROSTER}+ παίκτες.
      </p>
    </div>
  )
}

function TeamForm({ row, leagues, onClose, onSaved }: {
  row: Team | null; leagues: League[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName]     = useState(row?.name ?? '')
  const [league, setLeague] = useState(row?.league_id ?? '')
  const [logo, setLogo]     = useState(row?.logo_url ?? '')
  const [kitP, setKitP]     = useState((row as any)?.kit_primary ?? '#E05B1F')
  const [kitS, setKitS]     = useState((row as any)?.kit_secondary ?? '#111318')
  const [kitPat, setKitPat] = useState((row as any)?.kit_pattern ?? 'solid')
  const [busy, setBusy]     = useState(false)

  async function save() {
    if (!name.trim())  return toast.error('Χρειάζεται όνομα')
    if (!league)       return toast.error('Διάλεξε πρωτάθλημα')
    setBusy(true)

    const payload = {
      name: name.trim(),
      league_id: league,
      logo_url: logo.trim() || null,
      kit_primary: kitP,
      kit_secondary: kitS,
      kit_pattern: kitPat,
    }
    const { error } = row
      ? await supabase.from('teams').update(payload).eq('team_id', row.team_id)
      : await supabase.from('teams').insert(payload)

    setBusy(false)
    if (error) return toast.error('Δεν αποθηκεύτηκε')
    toast.success('Αποθηκεύτηκε'); onSaved()
  }

  return (
    <Modal title={row ? 'Επεξεργασία ομάδας' : 'Νέα ομάδα'} onClose={onClose}>
      <Field label="ΟΝΟΜΑ" value={name} onChange={setName} placeholder="Los Magos" />
      <Select label="ΠΡΩΤΑΘΛΗΜΑ" value={league} onChange={setLeague}
        options={leagues.map(l => ({ value: l.league_id, label: l.name }))} />
      <LogoUpload bucket="logos" url={logo} onChange={setLogo} fallback="⚽" label="ΣΗΜΑ ΟΜΑΔΑΣ" />

      {/* Εμφάνιση φανέλας (για Team of the Week) */}
      <div className="mt-1">
        <label className="block text-[8.5px] font-extrabold text-dim tracking-[0.12em] mb-1.5 pl-0.5">
          ΕΜΦΑΝΙΣΗ ΦΑΝΕΛΑΣ</label>
        <div className="flex items-center gap-3 bg-turf rounded-xl p-3 border border-chalk/[0.07]">
          <KitJersey primary={kitP} secondary={kitS} pattern={kitPat} />
          <div className="flex-1 flex flex-col gap-2">
            <label className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-silver font-semibold">Κύριο χρώμα</span>
              <input type="color" value={kitP} onChange={e => setKitP(e.target.value)}
                className="w-10 h-8 rounded bg-transparent" />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-silver font-semibold">2ο χρώμα</span>
              <input type="color" value={kitS} onChange={e => setKitS(e.target.value)}
                className="w-10 h-8 rounded bg-transparent" />
            </label>
            <select value={kitPat} onChange={e => setKitPat(e.target.value)}
              className="bg-pitch border border-chalk/10 rounded-lg px-2 py-1.5 text-chalk text-[12.5px]">
              <option value="solid">Μονόχρωμο</option>
              <option value="stripes">Ρίγες</option>
              <option value="halves">Μισό-μισό</option>
            </select>
          </div>
        </div>
      </div>

      <SaveBtn busy={busy} onClick={save} />
    </Modal>
  )
}

/* Προεπισκόπηση φανέλας ομάδας (μονόχρωμο / ρίγες / μισό-μισό) */
function KitJersey({ primary, secondary, pattern }: { primary: string; secondary: string; pattern: string }) {
  const J = 'M35 8 L18 18 L8 38 L22 48 L33 40 L33 92 L67 92 L67 40 L78 48 L92 38 L82 18 L65 8 L58 15 C53 19 47 19 42 15 Z'
  const id = `kp-${pattern}-${primary}-${secondary}`.replace(/[^a-zA-Z0-9-]/g, '')
  let fill: string = primary
  let defs: React.ReactNode = null
  if (pattern === 'halves') {
    fill = `url(#${id})`
    defs = (
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="50%" stopColor={primary} /><stop offset="50%" stopColor={secondary} />
      </linearGradient></defs>
    )
  } else if (pattern === 'stripes') {
    fill = `url(#${id})`
    const cols = [primary, secondary]
    const stops: React.ReactNode[] = []
    for (let k = 0; k < 6; k++) {
      stops.push(
        <stop key={'a' + k} offset={`${(k / 6) * 100}%`} stopColor={cols[k % 2]} />,
        <stop key={'b' + k} offset={`${((k + 1) / 6) * 100}%`} stopColor={cols[k % 2]} />,
      )
    }
    defs = <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0">{stops}</linearGradient></defs>
  }
  return (
    <svg width={70} height={70} viewBox="0 0 100 100" style={{ flex: 'none' }}>
      {defs}
      <path d={J} fill={fill} stroke="#fff" strokeWidth={3} strokeLinejoin="round" />
    </svg>
  )
}

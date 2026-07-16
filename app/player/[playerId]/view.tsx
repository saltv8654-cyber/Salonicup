'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Watermark, Avatar, SectionLabel, Empty } from '@/app/ui'
import toast from 'react-hot-toast'
import type { PlayerStat } from '@/lib/types'

interface Row {
  round: number; opponent: string; opponentLogo: string | null
  result: string; goals: number; assists: number; yellow: number; red: number
}

export default function PlayerView({ stat, team, history }: {
  stat: PlayerStat
  team: { team_id: string; name: string; logo_url: string | null } | null
  history: Row[]
}) {
  const router = useRouter()
  const { isSpeaker } = useAuth()
  const supabase = createClient()
  const [photo, setPhoto] = useState(stat.photo_url)
  const [busy, setBusy]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Φωτό επιτόπου — ανοίγει η κάμερα, ανεβαίνει στο Supabase */
  async function capture(file: File) {
    setBusy(true)
    const local = URL.createObjectURL(file)
    setPhoto(local)

    try {
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${stat.player_id}-${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('players').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('players').getPublicUrl(path)

      const { error: dbErr } = await supabase
        .from('players').update({ photo_url: publicUrl }).eq('player_id', stat.player_id)
      if (dbErr) throw dbErr

      setPhoto(publicUrl)
      toast.success('Η φωτογραφία αποθηκεύτηκε')
      router.refresh()
    } catch (e: any) {
      setPhoto(stat.photo_url)
      toast.error(e.message ?? 'Δεν ανέβηκε η φωτογραφία')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2.5">
        <Link href={`/team/${stat.team_id}`}
          className="w-[30px] h-[30px] rounded-lg bg-chalk/[0.06] grid place-items-center
            text-silver text-base">
          ‹
        </Link>
        <span className="text-[10.5px] text-dim font-bold">{team?.name}</span>
      </div>

      {/* Ήρωας */}
      <div className="relative bg-turf px-4 py-5 border-b-2 border-brand overflow-hidden">
        <Watermark />
        <div className="relative flex items-center gap-4">
          {/* Φωτογραφία — μεγάλη, με κάμερα για speaker/admin */}
          <div className="relative shrink-0">
            <Avatar url={photo} name={stat.full_name} size={96} ring />
            {busy && (
              <div className="absolute inset-0 rounded-full bg-black/60 grid place-items-center">
                <div className="spinner" />
              </div>
            )}
            {isSpeaker && !busy && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute -right-0.5 -bottom-0.5 w-8 h-8 rounded-full
                    bg-brand border-2 border-turf grid place-items-center text-sm
                    active:scale-95 transition-transform"
                  aria-label="Φωτογραφία">
                  📷
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) capture(f)
                    e.target.value = ''
                  }}
                />
              </>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {stat.number != null && (
              <span className="text-2xl font-extrabold text-lit leading-none tnum">
                {stat.number}
              </span>
            )}
            <h1 className="text-lg font-extrabold text-chalk mt-1 leading-tight tracking-tight">
              {stat.full_name}
            </h1>
            <p className="text-[11px] text-dim mt-1.5">{team?.name}</p>
          </div>
        </div>
      </div>

      {/* Σύνολα */}
      <div className="px-3.5 py-4">
        <div className="grid grid-cols-3 gap-1.5 mb-6">
          <Box v={stat.goals}        l="ΓΚΟΛ"   c="text-lit" big />
          <Box v={stat.assists}      l="ΑΣΙΣΤ"  c="text-chalk" big />
          <Box v={stat.mvp_awards ?? 0} l="MVP"  c="text-lit" big />
          <Box v={stat.appearances}  l="ΣΥΜΜ."  c="text-silver" />
          <Box v={stat.yellow_cards} l="ΚΙΤΡ."  c="text-card" />
          <Box v={stat.red_cards}    l="ΚΟΚΚ."  c="text-danger" />
        </div>

        {stat.own_goals > 0 && (
          <p className="text-[10px] text-dim text-center -mt-3 mb-5">
            Αυτογκόλ: {stat.own_goals}
          </p>
        )}

        <SectionLabel>Ανά αγωνιστική</SectionLabel>
        {!history.length ? <Empty>Δεν έχει αγωνιστεί ακόμα.</Empty> : (
          <div className="flex flex-col gap-1">
            {history.map(m => (
              <div key={m.round}
                className="bg-turf rounded-lg px-3 py-2.5 border border-chalk/[0.04]
                  grid items-center gap-2
                  [grid-template-columns:26px_22px_1fr_42px_58px]">
                <span className="text-[10px] font-extrabold text-dim">Α{m.round}</span>
                <span className="grid place-items-center">
                  {m.opponentLogo
                    ? <img src={m.opponentLogo} alt="" className="w-[18px] h-[18px] object-contain" />
                    : <span className="text-[15px]">⚽</span>}
                </span>
                <span className="text-[12.5px] text-silver truncate">{m.opponent}</span>
                <span className="text-center text-xs font-extrabold text-chalk tnum">
                  {m.result}
                </span>
                <div className="flex gap-1.5 justify-end items-center">
                  {m.goals > 0 && <Pip icon="⚽" n={m.goals} />}
                  {m.assists > 0 && <Pip icon="🅰" n={m.assists} />}
                  {m.yellow > 0 && <span className="w-[7px] h-2.5 rounded-sm bg-card" />}
                  {m.red > 0 && <span className="w-[7px] h-2.5 rounded-sm bg-danger" />}
                  {!m.goals && !m.assists && !m.yellow && !m.red &&
                    <span className="text-[11px] text-off">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Box({ v, l, c, big }: { v: number; l: string; c: string; big?: boolean }) {
  return (
    <div className="bg-turf rounded-lg py-2.5 px-1 text-center border border-chalk/[0.05]">
      <div className={`${big ? 'text-[21px]' : 'text-[17px]'} font-extrabold leading-none tnum ${c}`}>
        {v}
      </div>
      <div className="text-[8px] text-dim font-bold mt-1 tracking-[0.05em]">{l}</div>
    </div>
  )
}

function Pip({ icon, n }: { icon: string; n: number }) {
  return (
    <span className="flex items-center gap-px text-[10px] font-extrabold text-lit">
      <span>{icon}</span>{n > 1 ? n : ''}
    </span>
  )
}

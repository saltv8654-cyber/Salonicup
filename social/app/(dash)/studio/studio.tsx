"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { POST_FORMATS, POST_TYPES, type PostFormat, type PostType } from "@/lib/posts/meta";

export interface Option { id: string; label: string; extra?: string }
export interface LeagueOption extends Option { rounds: Option[] }

export function Studio({ leagues, played, upcoming, drafts, today }: {
  leagues: LeagueOption[]; played: Option[]; upcoming: Option[]; drafts: Option[]; today: string;
}) {
  const [type, setType] = useState<PostType>("final");
  const [format, setFormat] = useState<PostFormat>("square");
  const [match, setMatch] = useState("");
  const [league, setLeague] = useState(leagues[0]?.id ?? "");
  const [scope, setScope] = useState<"round" | "day">("round");
  const [round, setRound] = useState("");
  const [day, setDay] = useState(today);
  const [weekMode, setWeekMode] = useState<"program" | "results">("program");
  const [weekLeagues, setWeekLeagues] = useState<string[]>(leagues.map((l) => l.id));
  const [sponsors, setSponsors] = useState(true);
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const needs = POST_TYPES[type].needs;
  const squareOnly = ["schedule", "results", "standings"].includes(type);
  const matches = type === "versus" ? upcoming : type === "mvp" ? played.filter((m) => m.extra === "mvp") : played;
  const rounds = leagues.find((l) => l.id === league)?.rounds ?? [];

  const spec = useMemo(() => {
    const o: Record<string, unknown> = { type, sponsors };
    if (!squareOnly) o.format = format;
    if (needs === "match") o.match_id = match;
    if (needs === "league") {
      o.league_id = league;
      if (type !== "standings") { if (scope === "day") o.day = day; else if (round) o.round = round; }
    }
    if (needs === "week") { o.week_date = day; o.week_mode = weekMode; o.league_ids = weekLeagues; }
    if (needs === "day") o.day = day;
    return o;
  }, [type, sponsors, squareOnly, format, needs, match, league, scope, day, round, weekMode, weekLeagues]);
  const ready = needs !== "match" || !!match;

  const params = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(spec)) {
      if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
      else if (v !== undefined && v !== "") p.set(k, String(v));
    }
    return p;
  };
  async function preview() {
    setLoading(true); setError(null); setSaved(null);
    const res = await fetch(`/api/graphics/preview?${params()}`);
    setLoading(false);
    if (!res.ok) { setShown(null); return setError(await res.text()); }
    setShown(URL.createObjectURL(await res.blob()));
  }
  async function save() {
    setLoading(true); setError(null);
    const res = await fetch("/api/graphics", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...spec, ...(draft ? { content_id: draft } : {}) }) });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? `HTTP ${res.status}`);
    setSaved(data.title);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="card space-y-4 self-start">
        <div><label className="label">Τύπος</label>
          <select className="input" value={type} onChange={(e) => { setType(e.target.value as PostType); setMatch(""); setShown(null); }}>
            {Object.entries(POST_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div><label className="label">Μέγεθος</label>
          <select className="input" value={squareOnly ? "square" : format} disabled={squareOnly} onChange={(e) => setFormat(e.target.value as PostFormat)}>
            {Object.entries(POST_FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {squareOnly && <p className="muted mt-1 text-xs">Όπως στην καρτέλα, μόνο τετράγωνο.</p>}</div>

        {needs === "match" && (
          <div><label className="label">{type === "versus" ? "Επόμενος αγώνας" : "Αγώνας που έληξε"}</label>
            <select className="input" value={match} onChange={(e) => setMatch(e.target.value)}>
              <option value="">— επίλεξε —</option>
              {matches.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {!matches.length && <p className="muted mt-1 text-xs">{type === "mvp" ? "Κανένας πρόσφατος αγώνας με MVP." : "Κανένας αγώνας στο διάστημα."}</p>}</div>
        )}
        {needs === "league" && (
          <>
            <div><label className="label">Πρωτάθλημα</label>
              <select className="input" value={league} onChange={(e) => { setLeague(e.target.value); setRound(""); }}>
                {leagues.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select></div>
            {type !== "standings" && (
              <div className="space-y-2">
                <div className="flex gap-3 text-sm">
                  <label><input type="radio" checked={scope === "round"} onChange={() => setScope("round")} /> Αγωνιστική</label>
                  <label><input type="radio" checked={scope === "day"} onChange={() => setScope("day")} /> Ημέρα</label>
                </div>
                {scope === "round"
                  ? <select className="input" value={round} onChange={(e) => setRound(e.target.value)}>
                      <option value="">Αυτόματα ({type === "results" ? "τελευταία που παίχτηκε" : "επόμενη"})</option>
                      {rounds.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  : <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />}
              </div>
            )}
          </>
        )}
        {needs === "week" && (
          <>
            <div><label className="label">Εβδομάδα (οποιαδήποτε ημέρα της)</label>
              <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
            <div className="flex gap-3 text-sm">
              <label><input type="radio" checked={weekMode === "program"} onChange={() => setWeekMode("program")} /> Πρόγραμμα</label>
              <label><input type="radio" checked={weekMode === "results"} onChange={() => setWeekMode("results")} /> Αποτελέσματα</label>
            </div>
            <div className="space-y-1 text-sm">{leagues.map((l) => (
              <label key={l.id} className="flex items-center gap-2">
                <input type="checkbox" checked={weekLeagues.includes(l.id)}
                  onChange={(e) => setWeekLeagues(e.target.checked ? [...weekLeagues, l.id] : weekLeagues.filter((x) => x !== l.id))} /> {l.label}
              </label>
            ))}</div>
          </>
        )}
        {needs === "day" && (
          <div><label className="label">Ημέρα</label><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sponsors} onChange={(e) => setSponsors(e.target.checked)} /> Χορηγοί (Powered by)</label>
        <button className="btn-ghost w-full" disabled={!ready || loading} onClick={preview}>{loading ? "…" : "Προεπισκόπηση"}</button>
        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <label className="label">Σύνδεση με draft (προαιρετικό)</label>
          <select className="input" value={draft} onChange={(e) => setDraft(e.target.value)}>
            <option value="">—</option>
            {drafts.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <button className="btn-primary mt-3 w-full" disabled={!ready || loading} onClick={save}>Αποθήκευση στο Asset Library</button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">Αποθηκεύτηκε: {saved}. <Link className="underline" href="/assets">Asset Library</Link></p>}
      </div>
      <div className="card flex min-h-[420px] items-center justify-center bg-slate-100 dark:bg-slate-900">
        {shown
          ? <img src={shown} alt="Προεπισκόπηση" className="max-h-[75vh] w-auto rounded-lg shadow-lg" />
          : <p className="muted">{ready ? "Πάτα «Προεπισκόπηση»." : "Επίλεξε αγώνα."}</p>}
      </div>
    </div>
  );
}

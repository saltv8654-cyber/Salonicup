"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FORMATS, TEMPLATES, type FormatId, type TemplateId } from "@/lib/graphics/theme";

export interface MatchOption { id: string; label: string }

export function Studio({ played, upcoming, leagues, drafts }: {
  played: MatchOption[]; upcoming: MatchOption[]; leagues: MatchOption[]; drafts: MatchOption[];
}) {
  const [template, setTemplate] = useState<TemplateId>("final_score");
  const [format, setFormat] = useState<FormatId>("post");
  const [match, setMatch] = useState("");
  const [league, setLeague] = useState("");
  const [days, setDays] = useState(7);
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const needs = TEMPLATES[template].needs;
  const matches = template === "matchday" ? upcoming : played;
  const params = useMemo(() => {
    const p = new URLSearchParams({ template, format });
    if (needs === "match" && match) p.set("match_id", match);
    if (needs !== "match" && league) p.set("league_id", league);
    if (needs === "days") p.set("days", String(days));
    return p;
  }, [template, format, match, league, days, needs]);
  const ready = needs !== "match" || !!match;

  async function preview() {
    setLoading(true); setError(null); setSaved(null);
    const res = await fetch(`/api/graphics/preview?${params}`);
    setLoading(false);
    if (!res.ok) { setShown(null); return setError(await res.text()); }
    setShown(URL.createObjectURL(await res.blob()));
  }
  async function save() {
    setLoading(true); setError(null);
    const body = Object.fromEntries(params.entries()) as Record<string, unknown>;
    if (body.days) body.days = Number(body.days);
    if (draft) body.content_id = draft;
    const res = await fetch("/api/graphics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? `HTTP ${res.status}`);
    setSaved(data.title);
  }

  const select = "input";
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="card space-y-4 self-start">
        <div><label className="label">Template</label>
          <select className={select} value={template} onChange={(e) => { setTemplate(e.target.value as TemplateId); setMatch(""); setShown(null); }}>
            {Object.entries(TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div><label className="label">Διάσταση</label>
          <select className={select} value={format} onChange={(e) => setFormat(e.target.value as FormatId)}>
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label} · {v.width}×{v.height}</option>)}
          </select></div>
        {needs === "match" && (
          <div><label className="label">{template === "matchday" ? "Επόμενος αγώνας" : "Αγώνας που έληξε"}</label>
            <select className={select} value={match} onChange={(e) => setMatch(e.target.value)}>
              <option value="">— επίλεξε —</option>
              {matches.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {!matches.length && <p className="muted mt-1 text-xs">Κανένας αγώνας στο διάστημα.</p>}</div>
        )}
        {needs !== "match" && (
          <div><label className="label">Πρωτάθλημα</label>
            <select className={select} value={league} onChange={(e) => setLeague(e.target.value)}>
              <option value="">{needs === "days" ? "Όλα" : "Πρώτο ενεργό"}</option>
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select></div>
        )}
        {needs === "days" && (
          <div><label className="label">Ημέρες {template === "fixtures" ? "μπροστά" : "πίσω"}</label>
            <input className={select} type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value) || 7)} /></div>
        )}
        <button className="btn-ghost w-full" disabled={!ready || loading} onClick={preview}>{loading ? "…" : "Προεπισκόπηση"}</button>
        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <label className="label">Σύνδεση με draft (προαιρετικό)</label>
          <select className={select} value={draft} onChange={(e) => setDraft(e.target.value)}>
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

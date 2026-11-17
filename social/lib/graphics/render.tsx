import React from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as league from "../salonicup";
import { FORMATS, TEMPLATES, themeFrom, type FormatId, type TemplateId } from "./theme";
import { FinalScore, Matchday, MatchList, Mvp, Standings, TopScorers, type Frame, type Images, type ScorerRow, type StandingRow } from "./templates";

void React;

export interface GraphicSpec {
  template: TemplateId;
  format: FormatId;
  match_id?: string;
  league_id?: string;
  days?: number;
}

/** A graphic cannot be made from the data that exists (e.g. Final Score for a match not yet played). */
export class GraphicError extends Error {}

interface BrandSettings { brand_name: string; colors: { name: string; hex: string }[]; website: string | null; hashtags: string[]; timezone: string }

const PUBLIC = path.join(process.cwd(), "public");
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all([
  readFile(path.join(PUBLIC, "fonts/DejaVuSans.ttf")),
  readFile(path.join(PUBLIC, "fonts/DejaVuSans-Bold.ttf")),
]).then(([regular, bold]) => [
  { name: "Deja", data: regular, weight: 400 as const, style: "normal" as const },
  { name: "Deja", data: bold, weight: 700 as const, style: "normal" as const },
]));

/** Remote images (crests, player photos) as data URIs. Anything unreadable falls back to initials. */
async function toDataUri(url: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!["image/png", "image/jpeg", "image/jpg"].includes(type)) return null; // Satori: PNG/JPEG only
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadImages(urls: (string | null | undefined)[], fetcher: typeof fetch): Promise<Images> {
  const unique = [...new Set(urls.filter((u): u is string => !!u && /^https?:\/\//.test(u)))].slice(0, 40);
  const entries = await Promise.all(unique.map(async (u) => [u, await toDataUri(u, fetcher)] as const));
  let logo: string | null = null;
  try { logo = `data:image/png;base64,${(await readFile(path.join(PUBLIC, "logo.png"))).toString("base64")}`; } catch { /* optional */ }
  return { ...Object.fromEntries(entries), logo };
}

export interface Rendered {
  png: Buffer;
  width: number;
  height: number;
  title: string;
  match_id: string | null;
}

/** Builds a graphic from real league data. Throws GraphicError when the data does not support it. */
export async function renderGraphic(db: SupabaseClient, spec: GraphicSpec, settings: BrandSettings, fetcher: typeof fetch = fetch): Promise<Rendered> {
  const fmt = FORMATS[spec.format];
  const tpl = TEMPLATES[spec.template];
  if (!fmt || !tpl) throw new GraphicError("Άγνωστο template ή format");
  const t = themeFrom(settings);
  const tz = settings.timezone;
  // Stories have far more vertical room: everything is drawn larger.
  const s = spec.format === "story" ? 1.22 : Math.min(fmt.width, fmt.height) / 1080;

  let element: (f: Frame) => React.ReactElement;
  let urls: (string | null | undefined)[] = [];
  let title: string = tpl.label;
  let matchId: string | null = null;

  if (tpl.needs === "match") {
    if (!spec.match_id) throw new GraphicError("Χρειάζεται αγώνας (match_id)");
    const m = await league.matchDetail(db, spec.match_id);
    if (!m) throw new GraphicError("Ο αγώνας δεν βρέθηκε");
    const played = m.status === "Played" || m.status === "Forfeit";
    if (spec.template === "final_score" && !played) throw new GraphicError(`Ο αγώνας δεν έχει ολοκληρωθεί (κατάσταση: ${m.status})`);
    if (spec.template === "matchday" && played) throw new GraphicError("Ο αγώνας έχει ήδη παιχτεί — χρησιμοποίησε Final Score");
    if (spec.template === "mvp" && !m.mvp) throw new GraphicError("Δεν έχει οριστεί MVP για αυτόν τον αγώνα");
    matchId = m.match_id;
    title = `${tpl.label}: ${m.home} - ${m.away}`;
    urls = [m.home_logo, m.away_logo, m.mvp_photo];
    element = (f) => spec.template === "final_score" ? <FinalScore f={f} m={m} /> : spec.template === "matchday" ? <Matchday f={f} m={m} /> : <Mvp f={f} m={m} />;
  } else if (tpl.needs === "days") {
    const days = spec.days ?? 7;
    const fixtures = spec.template === "fixtures";
    const list = fixtures ? await league.upcomingMatches(db, days) : await league.recentResults(db, days);
    const filtered = (list as league.MatchDetail[]).filter((m) => !spec.league_id || m.league_id === spec.league_id);
    if (!filtered.length) throw new GraphicError(fixtures ? `Δεν υπάρχουν αγώνες τις επόμενες ${days} ημέρες` : `Δεν υπάρχουν αποτελέσματα τις τελευταίες ${days} ημέρες`);
    const leagues = [...new Set(filtered.map((m) => m.league))];
    const kicker = leagues.length === 1 ? leagues[0]! : `${filtered.length} αγώνες`;
    urls = filtered.flatMap((m) => [m.home_logo, m.away_logo]);
    title = `${tpl.label}${leagues.length === 1 ? ` · ${leagues[0]}` : ""}`;
    element = (f) => <MatchList f={f} title={fixtures ? "ΠΡΟΓΡΑΜΜΑ" : "ΑΠΟΤΕΛΕΣΜΑΤΑ"} kicker={kicker} matches={filtered} mode={fixtures ? "fixtures" : "results"} />;
  } else {
    const ls = await league.leagues(db);
    const l = spec.league_id ? ls.find((x) => x.league_id === spec.league_id) : ls[0];
    if (!l) throw new GraphicError("Δεν βρέθηκε ενεργό πρωτάθλημα");
    title = `${tpl.label} · ${l.name}`;
    if (spec.template === "standings") {
      const rows = (await league.standings(db, l.league_id)) as unknown as StandingRow[];
      if (!rows.length) throw new GraphicError("Δεν υπάρχει βαθμολογία ακόμα");
      urls = rows.map((r) => r.logo_url);
      element = (f) => <Standings f={f} league={l.name} rows={rows} />;
    } else {
      const [top] = await league.topScorers(db, 12, l.league_id);
      const rows = (top?.scorers ?? []) as ScorerRow[];
      if (!rows.length) throw new GraphicError("Δεν έχουν μπει γκολ ακόμα");
      element = (f) => <TopScorers f={f} league={l.name} rows={rows} />;
    }
  }

  const [img, fontData] = await Promise.all([loadImages(urls, fetcher), loadFonts()]);
  const frame: Frame = { t, format: spec.format, w: fmt.width, h: fmt.height, s, tz, img };
  const res = new ImageResponse(element(frame), { width: fmt.width, height: fmt.height, fonts: fontData });
  const png = Buffer.from(await res.arrayBuffer());
  return { png, width: fmt.width, height: fmt.height, title, match_id: matchId };
}

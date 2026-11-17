/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// Graphic templates rendered with next/og (Satori). Every element with children uses display:flex.
import React from "react";
import type { MatchDetail } from "../salonicup";
import { fit, fmtDay, fmtShort, fmtTime, initials, type FormatId, type Theme } from "./theme";

void React; // JSX runtime for the test runner

export interface Images { logo: string | null; [url: string]: string | null }
export interface Frame { t: Theme; format: FormatId; w: number; h: number; s: number; tz: string; img: Images }

const row = { display: "flex", flexDirection: "row" as const, alignItems: "center" as const };
const col = { display: "flex", flexDirection: "column" as const };

function Crest({ f, url, name, size }: { f: Frame; url: string | null | undefined; name?: string | null; size: number }) {
  const src = url ? f.img[url] : null;
  if (src) return <img src={src} width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />;
  return (
    <div style={{ ...row, justifyContent: "center", width: size, height: size, borderRadius: size / 2, background: f.t.card,
      border: `${Math.max(2, size / 40)}px solid ${f.t.primary}`, color: f.t.text, fontSize: size * 0.36, fontWeight: 700 }}>
      {initials(name)}
    </div>
  );
}

/** Common frame: brand bar on top, content in the middle, website and hashtag at the bottom. */
function Shell({ f, kicker, title, children }: { f: Frame; kicker?: string; title: string; children: React.ReactNode }) {
  const { t, s } = f;
  const pad = 64 * s;
  return (
    <div style={{ ...col, width: "100%", height: "100%", background: t.bg, color: t.text, fontFamily: "Deja", padding: pad, position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 14 * s, background: t.primary, display: "flex" }} />
      <div style={{ ...row, justifyContent: "space-between" }}>
        <div style={{ ...row }}>
          {f.img.logo && <img src={f.img.logo} width={84 * s} height={84 * s} style={{ borderRadius: 18 * s, marginRight: 22 * s }} />}
          <div style={{ ...col }}>
            <div style={{ display: "flex", fontSize: 30 * s, fontWeight: 700, letterSpacing: 6 * s, color: t.accent }}>{t.brand}</div>
            {kicker && <div style={{ display: "flex", fontSize: 24 * s, color: t.muted, marginTop: 4 * s }}>{kicker}</div>}
          </div>
        </div>
        <div style={{ display: "flex", background: t.primary, color: "#fff", fontSize: 26 * s, fontWeight: 700, letterSpacing: 3 * s,
          padding: `${12 * s}px ${26 * s}px`, borderRadius: 999 }}>{title}</div>
      </div>
      <div style={{ ...col, flex: 1, justifyContent: "center" }}>{children}</div>
      <div style={{ ...row, justifyContent: "space-between", fontSize: 24 * s, color: t.dim, letterSpacing: 2 * s }}>
        <div style={{ display: "flex" }}>{t.website}</div>
        <div style={{ display: "flex", color: t.accent }}>{t.hashtag}</div>
      </div>
    </div>
  );
}

const leagueLine = (m: MatchDetail) =>
  [m.league, m.stage && m.stage !== "regular" ? m.stage : m.round ? `${m.round}η αγωνιστική` : null].filter(Boolean).join(" · ");

function Team({ f, name, logo, size }: { f: Frame; name?: string | null; logo?: string | null; size: number }) {
  const s = f.s;
  return (
    <div style={{ ...col, alignItems: "center", width: "31%" }}>
      <Crest f={f} url={logo} name={name} size={size} />
      <div style={{ display: "flex", textAlign: "center", justifyContent: "center", fontSize: fit(name, 42 * s, 14), fontWeight: 700, marginTop: 24 * s, lineHeight: 1.15 }}>
        {name ?? "?"}
      </div>
    </div>
  );
}

export function FinalScore({ f, m }: { f: Frame; m: MatchDetail }) {
  const { t, s } = f;
  const crest = (f.format === "square" ? 170 : 200) * s;
  const scorers = (list: string[], align: "flex-start" | "flex-end") => (
    <div style={{ ...col, width: "49%", alignItems: align }}>
      {list.slice(0, 7).map((n, i) => (
        <div key={i} style={{ ...row, flexDirection: align === "flex-end" ? "row-reverse" : "row", fontSize: fit(n, 26 * s, 24), color: t.muted, marginBottom: 8 * s }}>
          <div style={{ display: "flex", flexShrink: 0, width: 12 * s, height: 12 * s, borderRadius: 999, background: t.primary, margin: `0 ${12 * s}px` }} />
          <div style={{ display: "flex" }}>{n}</div>
        </div>
      ))}
    </div>
  );
  return (
    <Shell f={f} kicker={leagueLine(m)} title={m.forfeit ? "ΝΙΚΗ ΣΤΑ ΧΑΡΤΙΑ" : "ΤΕΛΙΚΟ"}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <Team f={f} name={m.home} logo={m.home_logo} size={crest} />
        <div style={{ ...col, alignItems: "center" }}>
          <div style={{ ...row, fontSize: (`${m.goals_home}${m.goals_away}`.length > 2 ? 118 : 150) * s, fontWeight: 700, lineHeight: 1 }}>
            <div style={{ display: "flex" }}>{m.goals_home}</div>
            <div style={{ display: "flex", color: t.primary, margin: `0 ${20 * s}px` }}>-</div>
            <div style={{ display: "flex" }}>{m.goals_away}</div>
          </div>
          {(m.pens_home > 0 || m.pens_away > 0) && (
            <div style={{ display: "flex", fontSize: 34 * s, fontWeight: 700, color: t.accent, marginTop: 16 * s }}>πέν. {m.pens_home}-{m.pens_away}</div>
          )}
        </div>
        <Team f={f} name={m.away} logo={m.away_logo} size={crest} />
      </div>
      {f.format !== "landscape" && (m.home_scorers.length > 0 || m.away_scorers.length > 0) && (
        <div style={{ ...row, justifyContent: "space-between", alignItems: "flex-start", marginTop: 48 * s, paddingTop: 32 * s, borderTop: `2px solid ${t.card}` }}>
          {scorers(m.home_scorers, "flex-start")}
          {scorers(m.away_scorers, "flex-end")}
        </div>
      )}
      {m.mvp && (
        <div style={{ ...row, justifyContent: "center", marginTop: 36 * s }}>
          <div style={{ ...row, background: t.surface, borderRadius: 999, padding: `${12 * s}px ${30 * s}px`, fontSize: 28 * s }}>
            <div style={{ display: "flex", color: t.accent, fontWeight: 700, marginRight: 14 * s }}>MVP</div>
            <div style={{ display: "flex" }}>{m.mvp}</div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export function Matchday({ f, m }: { f: Frame; m: MatchDetail }) {
  const { t, s } = f;
  const tall = f.format === "story";
  const crest = (tall ? 250 : f.format === "square" ? 180 : 210) * s;
  return (
    <Shell f={f} kicker={leagueLine(m)} title="MATCHDAY">
      <div style={{ ...row, justifyContent: "space-between" }}>
        <Team f={f} name={m.home} logo={m.home_logo} size={crest} />
        <div style={{ display: "flex", fontSize: 72 * s, fontWeight: 700, color: t.primary }}>VS</div>
        <Team f={f} name={m.away} logo={m.away_logo} size={crest} />
      </div>
      <div style={{ ...col, alignItems: "center", marginTop: (tall ? 90 : 56) * s }}>
        <div style={{ display: "flex", fontSize: 40 * s, fontWeight: 700 }}>{fmtDay(m.date, f.tz)}</div>
        <div style={{ display: "flex", fontSize: 88 * s, fontWeight: 700, color: t.accent, marginTop: 8 * s }}>{fmtTime(m.date, f.tz) || "—"}</div>
        {(m.venue || m.field) && (
          <div style={{ display: "flex", fontSize: 30 * s, color: t.muted, marginTop: 10 * s }}>{[m.venue, m.field].filter(Boolean).join(" · ")}</div>
        )}
        {m.stream_url && (
          <div style={{ ...row, marginTop: 30 * s, background: t.surface, borderRadius: 999, padding: `${10 * s}px ${28 * s}px`, fontSize: 26 * s }}>
            <div style={{ display: "flex", width: 16 * s, height: 16 * s, borderRadius: 999, background: "#E11D48", marginRight: 12 * s }} />
            <div style={{ display: "flex" }}>Ζωντανά στο YouTube</div>
          </div>
        )}
      </div>
    </Shell>
  );
}

export function Mvp({ f, m }: { f: Frame; m: MatchDetail }) {
  const { t, s } = f;
  const size = (f.format === "story" ? 520 : f.format === "landscape" ? 300 : 400) * s;
  const photo = m.mvp_photo ? f.img[m.mvp_photo] : null;
  return (
    <Shell f={f} kicker={leagueLine(m)} title="MVP">
      <div style={{ ...col, alignItems: "center" }}>
        {photo
          ? <img src={photo} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", borderRadius: size / 2, border: `${10 * s}px solid ${t.primary}` }} />
          : <div style={{ ...row, justifyContent: "center", width: size, height: size, borderRadius: size / 2, background: t.card, border: `${10 * s}px solid ${t.primary}`, fontSize: size * 0.32, fontWeight: 700 }}>{initials(m.mvp)}</div>}
        <div style={{ display: "flex", fontSize: fit(m.mvp, 70 * s, 16), fontWeight: 700, marginTop: 36 * s, textAlign: "center" }}>{m.mvp ?? "—"}</div>
        {m.mvp_team && <div style={{ display: "flex", fontSize: 34 * s, color: t.accent, marginTop: 8 * s }}>{m.mvp_team}</div>}
        <div style={{ display: "flex", fontSize: 30 * s, color: t.muted, marginTop: 28 * s }}>{m.home} {m.score ?? "-"} {m.away}</div>
      </div>
    </Shell>
  );
}

const maxRows = (f: Frame, base: number) => Math.max(3, Math.floor(base * ({ post: 1, square: 0.75, story: 1.45, landscape: 0.6 }[f.format])));

export function MatchList({ f, title, kicker, matches, mode }: { f: Frame; title: string; kicker: string; matches: MatchDetail[]; mode: "fixtures" | "results" }) {
  const { t, s } = f;
  const shown = matches.slice(0, maxRows(f, 8));
  const crest = 54 * s;
  return (
    <Shell f={f} kicker={kicker} title={title}>
      <div style={{ ...col }}>
        {shown.map((m) => (
          <div key={m.match_id} style={{ ...col, background: t.surface, borderRadius: 22 * s, padding: `${16 * s}px ${24 * s}px`, marginBottom: 14 * s }}>
            <div style={{ display: "flex", fontSize: 21 * s, color: t.dim, marginBottom: 6 * s }}>
              {[mode === "fixtures" ? `${fmtShort(m.date, f.tz)} ${fmtTime(m.date, f.tz)}` : fmtShort(m.date, f.tz), m.league, mode === "fixtures" ? m.venue : null].filter(Boolean).join(" · ")}
            </div>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div style={{ ...row, width: "40%" }}>
                <Crest f={f} url={m.home_logo} name={m.home} size={crest} />
                <div style={{ display: "flex", fontSize: fit(m.home, 30 * s, 14), fontWeight: 700, marginLeft: 14 * s }}>{m.home}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", width: "20%", fontSize: 40 * s, fontWeight: 700, color: mode === "results" ? t.text : t.primary }}>
                {mode === "results" ? `${m.goals_home} - ${m.goals_away}` : "vs"}
              </div>
              <div style={{ ...row, width: "40%", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", fontSize: fit(m.away, 30 * s, 14), fontWeight: 700, marginRight: 14 * s, textAlign: "right" }}>{m.away}</div>
                <Crest f={f} url={m.away_logo} name={m.away} size={crest} />
              </div>
            </div>
          </div>
        ))}
        {matches.length > shown.length && <div style={{ display: "flex", justifyContent: "center", fontSize: 24 * s, color: t.muted }}>+{matches.length - shown.length} ακόμα στο {t.website}</div>}
      </div>
    </Shell>
  );
}

export interface StandingRow { position: number; team_name: string; logo_url: string | null; played: number; wins: number; draws: number; losses: number; goals_for: number; goals_against: number; points: number }

export function Standings({ f, league, rows }: { f: Frame; league: string; rows: StandingRow[] }) {
  const { t, s } = f;
  const shown = rows.slice(0, maxRows(f, 12));
  const fs = 27 * s;
  const cell = (v: React.ReactNode, w: number, bold = false, color?: string) =>
    <div style={{ display: "flex", justifyContent: "center", width: w * s, fontSize: fs, fontWeight: bold ? 700 : 400, color }}>{v}</div>;
  return (
    <Shell f={f} kicker={league} title="ΒΑΘΜΟΛΟΓΙΑ">
      <div style={{ ...col }}>
        <div style={{ ...row, color: t.dim, fontSize: 21 * s, padding: `0 ${20 * s}px ${10 * s}px` }}>
          <div style={{ display: "flex", width: 60 * s }}>#</div>
          <div style={{ display: "flex", flex: 1 }}>Ομάδα</div>
          {cell("Αγ", 70)}{cell("Ν-Ι-Η", 150)}{cell("Γκολ", 130)}{cell("Β", 80)}
        </div>
        {shown.map((r) => (
          <div key={r.position} style={{ ...row, background: r.position <= 3 ? t.surface : "transparent", borderRadius: 16 * s, padding: `${10 * s}px ${20 * s}px`, marginBottom: 4 * s }}>
            <div style={{ display: "flex", width: 60 * s, fontSize: fs, fontWeight: 700, color: r.position === 1 ? t.accent : t.text }}>{r.position}</div>
            <div style={{ ...row, flex: 1 }}>
              <Crest f={f} url={r.logo_url} name={r.team_name} size={40 * s} />
              <div style={{ display: "flex", fontSize: fit(r.team_name, fs, 18), fontWeight: 700, marginLeft: 14 * s }}>{r.team_name}</div>
            </div>
            {cell(r.played, 70)}{cell(`${r.wins}-${r.draws}-${r.losses}`, 150, false, t.muted)}{cell(`${r.goals_for}:${r.goals_against}`, 130, false, t.muted)}{cell(r.points, 80, true, t.accent)}
          </div>
        ))}
      </div>
    </Shell>
  );
}

export interface ScorerRow { full_name: string; team_name: string; goals: number; assists: number }

export function TopScorers({ f, league, rows }: { f: Frame; league: string; rows: ScorerRow[] }) {
  const { t, s } = f;
  const shown = rows.slice(0, maxRows(f, 10));
  return (
    <Shell f={f} kicker={league} title="ΣΚΟΡΕΡ">
      <div style={{ ...col }}>
        {shown.map((r, i) => (
          <div key={i} style={{ ...row, background: i === 0 ? t.surface : "transparent", borderRadius: 18 * s, padding: `${14 * s}px ${22 * s}px`, marginBottom: 6 * s }}>
            <div style={{ display: "flex", width: 64 * s, fontSize: 34 * s, fontWeight: 700, color: i < 3 ? t.accent : t.dim }}>{i + 1}</div>
            <div style={{ ...col, flex: 1 }}>
              <div style={{ display: "flex", fontSize: fit(r.full_name, 32 * s, 20), fontWeight: 700 }}>{r.full_name}</div>
              <div style={{ display: "flex", fontSize: 22 * s, color: t.muted }}>{r.team_name}</div>
            </div>
            <div style={{ ...col, alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 44 * s, fontWeight: 700, color: t.primary }}>{r.goals}</div>
              <div style={{ display: "flex", fontSize: 18 * s, color: t.dim }}>γκολ{r.assists ? ` · ${r.assists} ασίστ` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

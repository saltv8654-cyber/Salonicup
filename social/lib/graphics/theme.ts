// Formats, brand theme and small helpers shared by the graphic templates.

export const FORMATS = {
  post: { width: 1080, height: 1350, label: "Post 4:5 (Instagram / Facebook)" },
  square: { width: 1080, height: 1080, label: "Τετράγωνο 1:1" },
  story: { width: 1080, height: 1920, label: "Story / Reel cover 9:16" },
  landscape: { width: 1280, height: 720, label: "YouTube thumbnail 16:9" },
} as const;
export type FormatId = keyof typeof FORMATS;

export const TEMPLATES = {
  final_score: { label: "Final Score", needs: "match" },
  matchday: { label: "Matchday", needs: "match" },
  mvp: { label: "MVP αγώνα", needs: "match" },
  fixtures: { label: "Πρόγραμμα", needs: "days" },
  results: { label: "Αποτελέσματα", needs: "days" },
  standings: { label: "Βαθμολογία", needs: "league" },
  top_scorers: { label: "Σκόρερ", needs: "league" },
} as const;
export type TemplateId = keyof typeof TEMPLATES;

// The Salonicup app palette (app/api/og/shared.ts) — the default when no brand colors are set.
export const SALONICUP = { bg: "#0B0B0E", surface: "#16161B", card: "#1C1C22", primary: "#E05B1F", accent: "#F5782E", text: "#EDEDF0", muted: "#B8B8C0", dim: "#63636E" };

export interface Theme { bg: string; surface: string; card: string; primary: string; accent: string; text: string; muted: string; dim: string; brand: string; website: string; hashtag: string }

/** Brand colors from Settings: the first is the main color; names like "φόντο"/"background" set the background. */
export function themeFrom(settings: { brand_name?: string; colors?: { name: string; hex: string }[]; website?: string | null; hashtags?: string[] }): Theme {
  const colors = settings.colors ?? [];
  const byName = (re: RegExp) => colors.find((c) => re.test(c.name))?.hex;
  const primary = byName(/κύρι|primary|main|brand/i) ?? colors.find((c) => !/φόντο|background|bg|κείμενο|text/i.test(c.name))?.hex ?? SALONICUP.primary;
  return {
    ...SALONICUP,
    bg: byName(/φόντο|background|bg/i) ?? SALONICUP.bg,
    text: byName(/κείμενο|text/i) ?? SALONICUP.text,
    primary,
    accent: byName(/δευτ|secondary|accent/i) ?? (primary === SALONICUP.primary ? SALONICUP.accent : primary),
    brand: (settings.brand_name ?? "Salonicup").toUpperCase(),
    website: (settings.website ?? "salonicup.gr").replace(/^https?:\/\//, "").replace(/\/$/, ""),
    hashtag: settings.hashtags?.[0] ? (settings.hashtags[0].startsWith("#") ? settings.hashtags[0] : `#${settings.hashtags[0]}`) : "#salonicup",
  };
}

/** Shrinks long names so they fit on one or two lines. */
export function fit(text: string | null | undefined, base: number, max = 16): number {
  const n = (text ?? "").length;
  return n <= max ? base : Math.max(base * 0.55, base * (max / n) ** 0.7);
}

export const initials = (name?: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export function fmtDay(iso: string | null | undefined, tz: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("el-GR", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date(iso));
}
export function fmtTime(iso: string | null | undefined, tz: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso));
}
export function fmtShort(iso: string | null | undefined, tz: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("el-GR", { weekday: "short", day: "numeric", month: "numeric", timeZone: tz }).format(new Date(iso));
}

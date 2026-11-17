// Post types and sizes (client-safe: no Node-only imports).
export const POST_TYPES = {
  final: { label: "Τελικό σκορ", needs: "match" },
  mvp: { label: "MVP αγώνα", needs: "match" },
  versus: { label: "Αναμέτρηση", needs: "match" },
  schedule: { label: "Πρόγραμμα", needs: "league" },
  results: { label: "Αποτελέσματα", needs: "league" },
  standings: { label: "Βαθμολογία", needs: "league" },
  week: { label: "Εβδομάδα", needs: "week" },
  odds: { label: "Αποδόσεις", needs: "day" },
} as const;
export type PostType = keyof typeof POST_TYPES;

export const POST_FORMATS = {
  square: { w: 1080, h: 1080, label: "Τετράγωνο 1080×1080" },
  story: { w: 1080, h: 1920, label: "Story 1080×1920" },
  yt: { w: 1920, h: 1080, label: "YouTube 1920×1080" },
} as const;
export type PostFormat = keyof typeof POST_FORMATS;

// Single source of truth for what the system can really do, what needs credentials and what the
// platforms do not allow. Shown on the status page and given to the agent so it never claims more.

export type IntegrationState = "active" | "needs_credentials" | "planned" | "unsupported";

export interface Capability {
  name: string;
  /** what the official API allows */
  api: "yes" | "limited" | "no";
  note?: string;
}

export interface Integration {
  id: string;
  name: string;
  kind: "core" | "ai" | "social" | "creative" | "infra";
  phase: number;
  /** env vars that must be set for this integration to work */
  env: string[];
  /** true once the code for it exists in this repository */
  implemented: boolean;
  cost: string;
  limits: string[];
  capabilities?: Capability[];
}

export const INTEGRATIONS: Integration[] = [
  {
    id: "supabase", name: "Supabase του Salonicup (βάση, admins, δεδομένα πρωταθλήματος)", kind: "core", phase: 1, implemented: true,
    env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    cost: "Κανένα επιπλέον — το ίδιο project με το Salonicup app.",
    limits: ["Πίνακες με πρόθεμα social_· οι υπάρχοντες πίνακες του Salonicup μόνο διαβάζονται."],
  },
  {
    id: "anthropic", name: "Claude API (εγκέφαλος)", kind: "ai", phase: 1, implemented: true,
    env: ["ANTHROPIC_API_KEY"],
    cost: "Claude Opus 5.5: $4 / $20 ανά 1M tokens (input/output). Web search: $10 / 1.000 αναζητήσεις.",
    limits: ["Rate limits ανά tier λογαριασμού.", "Δεν παράγει εικόνες ή βίντεο — μόνο κείμενο, ανάλυση, αποφάσεις."],
  },
  {
    id: "worker", name: "Background worker (cron + ουρά)", kind: "infra", phase: 1, implemented: true,
    env: ["CRON_SECRET"],
    cost: "Χωρίς επιπλέον κόστος: Supabase pg_cron + pg_net καλούν τον worker κάθε 5 λεπτά.",
    limits: ["Το Vercel Hobby cron τρέχει μόνο 1×/ημέρα — γι' αυτό χρησιμοποιείται το pg_cron."],
  },
  {
    id: "token_crypto", name: "Κρυπτογράφηση OAuth tokens", kind: "core", phase: 1, implemented: true,
    env: ["TOKEN_ENCRYPTION_KEY"], cost: "—",
    limits: ["Χρειάζεται πριν συνδεθεί οποιοσδήποτε λογαριασμός social."],
  },
  {
    id: "meta_instagram", name: "Instagram (Graph API)", kind: "social", phase: 3, implemented: false,
    env: ["META_APP_ID", "META_APP_SECRET"],
    cost: "Δωρεάν. Για δική σου σελίδα/λογαριασμό αρκεί Meta App σε Development mode με εσένα ως admin — χωρίς App Review.",
    limits: [
      "Μόνο Professional λογαριασμοί (Business/Creator).",
      "Έως 100 δημοσιεύσεις μέσω API ανά 24ω ανά λογαριασμό.",
      "Τα media πρέπει να είναι σε δημόσιο URL (το Meta τα κατεβάζει).",
      "Demographics μόνο για λογαριασμούς με 100+ followers.",
      "Hashtag search: έως 30 μοναδικά hashtags ανά 7 ημέρες.",
    ],
    capabilities: [
      { name: "Post εικόνας / Carousel / Reel", api: "yes" },
      { name: "Story", api: "yes", note: "Μόνο Business λογαριασμοί" },
      { name: "Insights (reach, views, saves, shares, profile visits)", api: "yes" },
      { name: "Σχόλια: ανάγνωση, απάντηση, απόκρυψη", api: "yes" },
      { name: "DM (Messaging API)", api: "limited", note: "Παράθυρο 24 ωρών, ξεχωριστό App Review" },
      { name: "Ανταγωνιστές (Business Discovery)", api: "limited", note: "Μόνο δημόσια στοιχεία Business/Creator λογαριασμών" },
    ],
  },
  {
    id: "meta_facebook", name: "Facebook Pages", kind: "social", phase: 3, implemented: false,
    env: ["META_APP_ID", "META_APP_SECRET"],
    cost: "Δωρεάν. Ίδιο Meta App με το Instagram.",
    limits: ["Μόνο Pages (όχι προσωπικά προφίλ).", "Ορισμένα Page Insights metrics αποσύρθηκαν το 2025 υπέρ του «views»."],
    capabilities: [
      { name: "Post (κείμενο, φωτό, link, βίντεο)", api: "yes" },
      { name: "Reels / Stories σε Page", api: "yes" },
      { name: "Page & post insights", api: "yes" },
      { name: "Σχόλια και Messenger", api: "yes", note: "pages_manage_engagement / pages_messaging" },
      { name: "Ανταγωνιστικές Pages", api: "no", note: "Το Page Public Content Access δίνεται σπάνια" },
    ],
  },
  {
    id: "tiktok", name: "TikTok (Content Posting + Display API)", kind: "social", phase: 3, implemented: false,
    env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    cost: "Δωρεάν. Για δημόσιες δημοσιεύσεις μέσω API χρειάζεται audit της εφαρμογής από το TikTok (ισχύει και για εσωτερική χρήση).",
    limits: [
      "Χωρίς audit, κάθε δημοσίευση μέσω API είναι ιδιωτική (SELF_ONLY).",
      "Ημερήσιο όριο δημοσιεύσεων ανά creator και όριο αιτημάτων ανά λεπτό.",
      "Access token 24 ωρών, refresh token 365 ημερών.",
    ],
    capabilities: [
      { name: "Δημοσίευση βίντεο / photo post", api: "yes", note: "Direct Post ή αποστολή ως draft στο inbox" },
      { name: "Βασικά στατιστικά ανά βίντεο (views, likes, comments, shares)", api: "yes" },
      { name: "Watch time / retention / demographics", api: "no", note: "Όχι στο δημόσιο API για οργανικό περιεχόμενο" },
      { name: "Διαχείριση σχολίων", api: "limited", note: "Μόνο μέσω TikTok Business API, ξεχωριστή έγκριση" },
      { name: "Ανταγωνιστές", api: "no", note: "Το Research API είναι μόνο για ακαδημαϊκούς" },
    ],
  },
  {
    id: "youtube", name: "YouTube (Data API v3 + Analytics API)", kind: "social", phase: 3, implemented: false,
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    cost: "Δωρεάν με quota 10.000 units/ημέρα ανά project (αύξηση μέσω audit).",
    limits: [
      "Ένα upload κοστίζει πολλά quota units — λίγα uploads/ημέρα με το default quota.",
      "Projects χωρίς audit ανεβάζουν μόνο ιδιωτικά βίντεο (αλλάζουν σε δημόσια χειροκίνητα ή μετά το audit).",
      "Τα Shorts ανεβαίνουν ως κανονικά κάθετα βίντεο (δεν υπάρχει ξεχωριστό endpoint).",
    ],
    capabilities: [
      { name: "Upload βίντεο / Shorts, thumbnails", api: "yes", note: "Custom thumbnails θέλουν επαληθευμένο κανάλι" },
      { name: "Views, watch time, average view duration, retention, demographics", api: "yes" },
      { name: "Impressions / CTR thumbnail", api: "no", note: "Μόνο στο YouTube Studio" },
      { name: "Σχόλια: ανάγνωση και απάντηση", api: "yes" },
      { name: "Ανταγωνιστές (δημόσια στατιστικά καναλιών/βίντεο)", api: "yes" },
    ],
  },
  {
    id: "linkedin", name: "LinkedIn (Community Management API)", kind: "social", phase: 3, implemented: false,
    env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    cost: "Δωρεάν. Οι Company Pages απαιτούν έγκριση Community Management API. Χαμηλή προτεραιότητα για ένα πρωτάθλημα.",
    limits: ["Προσωπικό προφίλ: μόνο δημοσίευση (w_member_social).", "Access token 60 ημερών."],
    capabilities: [
      { name: "Post σε Company Page (κείμενο, εικόνα, βίντεο, document/carousel)", api: "limited", note: "Μετά από έγκριση" },
      { name: "Page analytics & followers", api: "limited", note: "Μετά από έγκριση" },
      { name: "Ανταγωνιστές", api: "no" },
    ],
  },
  {
    id: "graphics", name: "Γραφικά: τα σχέδια της καρτέλας Posts (server)", kind: "creative", phase: 2, implemented: true,
    env: [], cost: "Δωρεάν, τρέχει στον server (@napi-rs/canvas).",
    limits: ["Ίδιος κώδικας σχεδίασης με την καρτέλα Posts — ό,τι αλλάζει εκεί, το παίρνει και ο agent (npm run sync:posts).",
      "Στον server δεν μπαίνει το emoji 📍 στο γήπεδο της Αναμέτρησης (δεν υπάρχει γραμματοσειρά emoji)."],
  },
  {
    id: "image_ai", name: "AI εικόνες (π.χ. OpenAI Images, Google Imagen/Gemini, FLUX)", kind: "creative", phase: 2, implemented: false,
    env: ["IMAGE_PROVIDER_API_KEY"], cost: "Περίπου $0.02–0.20 ανά εικόνα, ανάλογα με πάροχο και ποιότητα.",
    limits: ["Το κείμενο μέσα σε AI εικόνες δεν είναι πάντα σωστό — τίτλοι/σκορ μπαίνουν από template."],
  },
  {
    id: "video", name: "Video pipeline (FFmpeg worker, υπότιτλοι)", kind: "creative", phase: 2, implemented: false,
    env: ["VIDEO_WORKER_URL", "TRANSCRIPTION_API_KEY"],
    cost: "Container με FFmpeg ($5–20/μήνα) + transcription (~$0.006/λεπτό).",
    limits: ["Δεν τρέχει σε Vercel functions (όρια μεγέθους/χρόνου) — χρειάζεται ξεχωριστός worker."],
  },
];

export function integrationState(i: Integration, env: Record<string, string | undefined> = process.env): IntegrationState {
  if (!i.implemented) return "planned";
  return i.env.every((k) => !!env[k]?.trim()) ? "active" : "needs_credentials";
}

export function missingEnv(i: Integration, env: Record<string, string | undefined> = process.env): string[] {
  return i.env.filter((k) => !env[k]?.trim());
}


# Autonomous AI Social Media Manager — Αρχιτεκτονική & αξιολόγηση integrations

Κατάσταση: **Phase 1 υλοποιημένη** (Core Agent, Business Profiles, Database, Authentication). Ημερομηνία: Νοέμβριος 2026.

> Κανόνας του έργου: καμία λειτουργία δεν εμφανίζεται ως ενεργή αν δεν υπάρχει πραγματικός κώδικας και ρυθμισμένα credentials.
> Η κατάσταση κάθε integration υπολογίζεται από τον server (`lib/integrations.ts`) και φαίνεται στη σελίδα **Κατάσταση APIs**.

---

## 1. Τα έξι επίπεδα

| Επίπεδο | Ρόλος | Υλοποίηση |
|---|---|---|
| **Claude** = εγκέφαλος | Σκέψη, σχεδιασμός, αποφάσεις, γραφή, ανάλυση | Claude API (Messages API + tool use), `claude-opus-5-5`, adaptive thinking, server-side fallback σε άρνηση |
| **MCP** = σύνδεση με εργαλεία | Τυποποιημένη σύνδεση εξωτερικών εργαλείων | (α) τα εσωτερικά εργαλεία του agent έχουν ήδη σχήμα συμβατό με MCP· (β) Phase 5: δικός μας MCP server ώστε Claude Code/Desktop να ελέγχουν το σύστημα· (γ) MCP connector του Claude API για τρίτα εργαλεία όπου υπάρχουν αξιόπιστα |
| **Creative AI** = γραφικά/βίντεο | Παραγωγή εικόνων, templates, video | Phase 2: templates με `next/og` (ακρίβεια brand), AI εικόνες από εξωτερικό πάροχο, FFmpeg worker για video |
| **APIs** = πραγματική πρόσβαση στα social | Δημοσίευση, insights, σχόλια | Phase 3–6: επίσημα APIs (Meta Graph, TikTok, YouTube Data/Analytics, LinkedIn) με OAuth |
| **Backend** = μνήμη, αυτοματισμοί, 24/7 | Βάση, ουρά, scheduler, audit | Supabase Postgres (RLS), ουρά εργασιών στη βάση, worker endpoint, pg_cron |
| **Dashboard** = έλεγχος | Chat, εγκρίσεις, calendar, ρυθμίσεις, kill switch | Next.js 14 (App Router), Tailwind, dark/light, mobile |

```
             ┌──────────────────────── Dashboard (Next.js on Vercel) ────────────────────────┐
  user ───▶  │  Chat · Calendar · Approvals · Settings · Activity · Status                  │
             └───────┬──────────────────────────────┬─────────────────────────────┬─────────┘
                     │ POST /api/agent/chat          │ approve / reject             │ RLS reads
                     ▼                               ▼                              ▼
             ┌──────────────── Core Agent (lib/agent/runner.ts) ─────────────┐   ┌───────────────┐
             │ Orchestrator (Claude) ── tools ──▶ DB writes (scoped)         │◀─▶│ Supabase      │
             │      │ delegate_to_specialist                                │   │ Postgres+RLS  │
             │      ▼                                                       │   │ Auth, Storage │
             │ Specialists: Creative · Content · Strategy · Analytics ·     │   └───────▲───────┘
             │ Community · Competitor · Publishing                          │           │
             │ Policy gate (autonomy mode, kill switch, roles)              │           │ claim_jobs()
             └───────────────────────────────▲──────────────────────────────┘           │ SKIP LOCKED
                                             │ runAgent(trigger=schedule)               │
             pg_cron (κάθε 5′) / Vercel Cron ──▶ /api/worker/tick ── schedules → jobs ──┘
                                             │
                     Phase 2–6 ──▶ Creative workers · Platform APIs (OAuth tokens, AES-GCM)
```

### Γιατί Messages API με δικό μας loop και όχι Managed Agents
Το Claude Managed Agents (Anthropic φιλοξενεί το loop και sandbox) είναι η προεπιλογή για agents, αλλά εδώ ο agent:
- γράφει σε δική μας βάση με αυστηρή απομόνωση ανά επιχείρηση (το `business_id` δεν περνά ποτέ από το μοντέλο),
- πρέπει να σταματά σε **εγκρίσεις** και **emergency stop** μεταξύ βημάτων,
- τρέχει από τον δικό μας scheduler και καταγράφει κάθε βήμα/κόστος στη βάση.

Όλα αυτά ζουν στο backend, όπως ζητά η αρχιτεκτονική. Το loop είναι ~150 γραμμές (`runner.ts`) και μπορεί να μεταφερθεί σε Managed Agents αργότερα αν χρειαστεί sandbox (π.χ. για video editing).

---

## 2. Core Agent (Phase 1 — ενεργό)

- **Orchestrator** (`ORCHESTRATOR_PROMPT`): ο «senior εργαζόμενος». Εκτελεί, δεν περιγράφει. Κανόνες ειλικρίνειας: δεν ισχυρίζεται ενέργειες χωρίς επιβεβαίωση από tool, δεν εφευρίσκει metrics.
- **7 specialists** μέσω `delegate_to_specialist`: Creative, Content Creation, Marketing Strategy, Analytics, Community, Competitor Research, Publishing. Ο καθένας έχει δικό του ρόλο, το ίδιο business context, και web search όπου έχει νόημα. Ο orchestrator ελέγχει την έξοδό τους πριν τη χρησιμοποιήσει.
- **Εργαλεία** (`lib/agent/tools.ts`): `save_memory`, `search_memory`, `update_brand_profile`, `create_campaign`, `create_content_drafts`, `list_content`, `update_content`, `schedule_content`, `get_recent_activity`, `delegate_to_specialist`, `web_search` (server tool).
- **Μνήμη**: brand profile + `memories` (γεγονότα, προτιμήσεις, μαθήματα, στρατηγική) + ιστορικό συζητήσεων. Κάθε απόρριψη με αιτιολογία γίνεται αυτόματα μνήμη «προτίμηση» — έτσι μαθαίνει.
- **Συζητήσεις**: αποθηκεύονται αυτούσια τα content blocks του API (append-only) και ξαναστέλνονται αμετάβλητα. Prompt caching στο σταθερό system prompt + business context.
- **Όρια**: 20 βήματα / 240″ ανά εντολή, μηνιαίος προϋπολογισμός AI και εκτελέσεων ανά πλάνο, καταγραφή κόστους ανά κλήση (`ai_usage`).

### Αυτονομία και εγκρίσεις (`lib/policy.ts`)
| Ενέργεια | Manual | Semi | Full | Paused (scheduled) | Paused (chat) |
|---|---|---|---|---|---|
| Drafts, μνήμη, καμπάνιες | ✅ | ✅ | ✅ | ⛔ | ✅ |
| Προγραμματισμός | 🟡 έγκριση | ✅ | ✅ | ⛔ | 🟡 |
| Δημοσίευση | 🟡 | 🟡 | ✅ | ⛔ | 🟡 |
| Απάντηση σε σχόλιο | 🟡 | ✅ | ✅ | ⛔ | 🟡 |
| Ευαίσθητη απάντηση / διαγραφή | 🟡 | 🟡 | 🟡 | ⛔ | 🟡 |
| Αλλαγή brand | ✅ μόνο από chat | ✅ chat | ✅ chat · 🟡 αυτόνομα | 🟡 | ✅ |

Kill switches: `businesses.autonomy_paused` (ανά επιχείρηση· ακυρώνει και την ουρά· ελέγχεται μεταξύ των βημάτων ενός run) και `organizations.agent_enabled` (όλος ο tenant).

---

## 3. Βάση δεδομένων & multi-tenancy

`supabase/migrations/0001_core.sql` — οργανισμός → επιχειρήσεις → όλα τα υπόλοιπα.

- **Απομόνωση**: κάθε πίνακας έχει `business_id` και RLS. Viewers διαβάζουν, editors γράφουν, admins διαγράφουν/αλλάζουν αυτονομία.
- Ο agent χρησιμοποιεί service role αλλά **κάθε query φιλτράρει με το `business_id` του run** — το μοντέλο δεν μπορεί να το αλλάξει (υπάρχει test γι' αυτό).
- `social_tokens`: RLS χωρίς policies, AES-256-GCM στην εφαρμογή — τα tokens δεν φτάνουν ποτέ στον browser.
- `activity_log`: append-only με trigger.
- `jobs` + `claim_jobs()` (`FOR UPDATE SKIP LOCKED`), idempotency keys, exponential backoff, dead-letter, απελευθέρωση κολλημένων εργασιών μετά από 15′.
- SaaS: `plans` (όρια επιχειρήσεων, λογαριασμών, προϋπολογισμού AI, εκτελέσεων), `ai_usage`, ρόλοι owner/admin/editor/viewer.

---

## 4. Αξιολόγηση integrations

> Τα όρια των πλατφορμών αλλάζουν συχνά. Οι τιμές παρακάτω είναι από την τεκμηρίωση που γνωρίζω και **πρέπει να επαληθευτούν στην αρχή της Phase 3** στα developer portals.

### 4.1 Κόστος και προϋποθέσεις

| Integration | Δωρεάν; | Τι χρειάζεται | Κύριος περιορισμός |
|---|---|---|---|
| Claude API | Πληρωμή ανά χρήση | API key | Opus 5.5: $4/$20 ανά 1M tokens· web search $10/1.000 |
| Supabase | Free tier / Pro $25 | Project | Το Free κάνει pause μετά από 7 ημέρες αδράνειας → **Pro για 24/7** |
| Vercel | Hobby / Pro $20 ανά μέλος | Project | Hobby: όχι εμπορική χρήση, cron 1×/ημέρα → pg_cron για συχνότερο tick |
| Meta (Instagram + Facebook) | Δωρεάν | Meta App, **App Review**, **Business Verification** | Μόνο Professional IG / Pages· ~100 API posts/24ω ανά IG λογαριασμό |
| TikTok | Δωρεάν | App + **audit** για Direct Post | Χωρίς audit, τα posts είναι ιδιωτικά· όχι watch time/demographics |
| YouTube Data + Analytics | Δωρεάν (quota) | Google Cloud project, OAuth consent verification, **audit** για δημόσια uploads | 10.000 units/ημέρα· τα uploads κοστίζουν πολλά units |
| LinkedIn | Δωρεάν | Έγκριση **Community Management API** για Company Pages | Χωρίς έγκριση μόνο προσωπικό προφίλ |
| AI εικόνες (OpenAI Images / Google Imagen–Gemini / FLUX) | Όχι | API key παρόχου | ~$0.02–0.20 ανά εικόνα |
| Αφαίρεση φόντου / upscale | Όχι ή self-hosted | remove.bg ή open-source μοντέλο σε worker | — |
| Video (FFmpeg) + υπότιτλοι | Self-hosted + transcription | Container ($5–20/μήνα) + speech-to-text (~$0.006/λεπτό) | Δεν τρέχει σε Vercel functions |
| Stripe | Ανά συναλλαγή | Λογαριασμός | — |

### 4.2 Τι επιτρέπουν τα APIs (σύνοψη)

| Δυνατότητα | Instagram | Facebook | TikTok | YouTube | LinkedIn Page |
|---|---|---|---|---|---|
| Post εικόνας / carousel | ✅ | ✅ | ✅ photo | — | ✅ (με έγκριση) |
| Reels / Shorts / video | ✅ | ✅ | ✅ | ✅ | ✅ (με έγκριση) |
| Stories | ✅ Business | ✅ | — | — | — |
| Προγραμματισμός | Δικός μας scheduler | Native + δικός μας | Δικός μας | Native (publishAt) | Δικός μας |
| Reach / views / engagement | ✅ | ✅ | Βασικά | ✅ | ✅ (με έγκριση) |
| Watch time / retention | Μερικά για Reels | Μερικά | ❌ | ✅ | ❌ |
| CTR thumbnail / impressions | — | — | — | ❌ (μόνο Studio) | — |
| Demographics | ✅ (100+ followers) | ✅ | ❌ | ✅ | ✅ (με έγκριση) |
| Σχόλια: ανάγνωση/απάντηση | ✅ | ✅ | Μόνο Business API | ✅ | ✅ (με έγκριση) |
| DMs | Περιορισμένα (24ω) | ✅ Messenger | ❌ | ❌ | ❌ |
| Ανταγωνιστές (δημόσια) | ✅ Business Discovery | ❌ στην πράξη | ❌ | ✅ | ❌ |

**Δεν υποστηρίζεται και δεν θα γίνει**: scraping, πρόσβαση σε ιδιωτικά δεδομένα ανταγωνιστών, μη επίσημα APIs. Όπου το API δεν δίνει κάτι, ο agent το δηλώνει.

---

## 5. Roadmap

| Phase | Περιεχόμενο | Κατάσταση | Tests |
|---|---|---|---|
| **1** | Core Agent + 7 specialists, μνήμη, business profiles, multi-tenant DB με RLS, auth, εγκρίσεις, kill switch, ουρά/scheduler, activity log, dashboard | ✅ Υλοποιημένο | 21 unit tests (policy, ουρά, χρόνος/DST, κρυπτογράφηση, εργαλεία agent) + 10 ομάδες DB tests σε PostgreSQL (απομόνωση, ρόλοι, append-only, ουρά) + build |
| **2** | Creative Studio: brand templates (post/story/carousel/matchday/final score/thumbnail) με `next/og`, Asset Library (uploads, tags), AI εικόνες, αφαίρεση φόντου, resize, video worker (Reels/Shorts/TikTok, υπότιτλοι) | Επόμενο | Renders σε όλες τις διαστάσεις, έλεγχος brand χρωμάτων/fonts |
| **3** | OAuth Meta/TikTok/YouTube/LinkedIn, token refresh, Publishing workers, retries, κατάσταση δημοσίευσης | — | Δημοσίευση σε test λογαριασμούς κάθε πλατφόρμας |
| **4** | Συλλογή insights, Analytics, Reports (ημέρα/εβδομάδα/μήνας), AI Performance Analyst με τεκμηρίωση | — | Συμφωνία με τα native insights |
| **5** | Optimization Agent: A/B tests, ιστορικό αλλαγών στρατηγικής και αξιολόγησή τους, MCP server | — | Πλήρης κύκλος hypothesis → αποτέλεσμα |
| **6** | Community Manager (σχόλια/μηνύματα), Competitor Analysis (μόνο δημόσια δεδομένα) | — | |
| **7** | Stripe συνδρομές, usage-based όρια, admin dashboard, προσκλήσεις μελών, backups/PITR | — | |

### Ειδικά για Salonicup (Phase 2)
Το υπάρχον app έχει ήδη αγώνες, σκορ, σκόρερ και ρόστερ στο Supabase. Τα **Matchday** και **Final Score** γραφικά θα παράγονται από πραγματικά δεδομένα αγώνα (όχι από AI εικόνα), ώστε ονόματα, σκορ και λογότυπα να είναι πάντα σωστά — και ο agent θα μπορεί να τα δημιουργεί αυτόματα όταν ένας αγώνας γίνει `Played`.

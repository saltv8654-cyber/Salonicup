# Salonicup Social Agent — Αρχιτεκτονική & αξιολόγηση integrations

Εσωτερικό εργαλείο: ένας AI agent που διαχειρίζεται **μόνο** τα social media του Salonicup. Δεν προορίζεται για πώληση σε τρίτους, γι' αυτό δεν έχει οργανισμούς, συνδρομές ή χρεώσεις.

Κατάσταση: **Phase 1 υλοποιημένη**. Νοέμβριος 2026.

> Κανόνας του έργου: καμία λειτουργία δεν εμφανίζεται ως ενεργή αν δεν υπάρχει πραγματικός κώδικας και ρυθμισμένα credentials.
> Η κατάσταση κάθε integration υπολογίζεται από τον server (`lib/integrations.ts`) και φαίνεται στη σελίδα **Κατάσταση APIs**.

---

## 1. Τα έξι επίπεδα

| Επίπεδο | Ρόλος | Υλοποίηση |
|---|---|---|
| **Claude** = εγκέφαλος | Σκέψη, σχεδιασμός, αποφάσεις, γραφή, ανάλυση | Claude API (Messages API + tool use), `claude-opus-5-5`, adaptive thinking, server-side fallback σε άρνηση |
| **MCP** = σύνδεση με εργαλεία | Τυποποιημένη σύνδεση εργαλείων | Τα εργαλεία του agent έχουν ήδη σχήμα συμβατό με MCP. Phase 5: δικός μας MCP server ώστε να τον ελέγχεις και από το Claude Code/Desktop |
| **Creative AI** = γραφικά/βίντεο | Εικόνες, templates, video | ✅ Τα σχέδια της καρτέλας Posts στον server (`lib/posts`). Επόμενα: AI εικόνες από εξωτερικό πάροχο, FFmpeg worker για clips από τα livestreams |
| **APIs** = πρόσβαση στα social | Δημοσίευση, insights, σχόλια | Phase 3–6: επίσημα APIs (Meta, TikTok, YouTube, LinkedIn) με OAuth |
| **Backend** = μνήμη, αυτοματισμοί, 24/7 | Βάση, ουρά, scheduler, audit | Η **ίδια βάση Supabase με το Salonicup** (πίνακες `social_*`), ουρά εργασιών, worker, pg_cron |
| **Dashboard** = έλεγχος | Chat, εγκρίσεις, calendar, ρυθμίσεις, emergency stop | Next.js 14, Tailwind, dark/light, mobile |

```
  admin ──▶ Dashboard (Next.js, ξεχωριστό Vercel project, root = social/)
              │ chat / εγκρίσεις / ρυθμίσεις
              ▼
          Core Agent (lib/agent/runner.ts)
            Orchestrator (Claude) ── εργαλεία ──▶ social_* πίνακες
              │  get_league_data ──────────────▶ matches, teams, players, events, standings, player_stats (μόνο ανάγνωση)
              │  delegate_to_specialist
              ▼
            Specialists: Creative · Content · Strategy · Analytics · Community · Competitor · Publishing
            Policy gate: autonomy mode + emergency stop + όριο κόστους
              ▲
  pg_cron (κάθε 5′) ──▶ /api/worker/tick ──▶ schedules → social_jobs → runAgent(schedule)
                                   ┌──────── Supabase του Salonicup ────────┐
                                   │ Auth (ίδιοι admins) · Postgres · Storage │
                                   └──────────────────────────────────────────┘
```

### Γιατί στην ίδια βάση με το Salonicup
- **Ίδιοι λογαριασμοί**: μπαίνεις με τον admin λογαριασμό του `/admin`. Πρόσβαση έχουν μόνο όσοι έχουν `profiles.role = 'admin'`. Οι speakers, οι αρχηγοί και οι επισκέπτες δεν βλέπουν τίποτα.
- **Πραγματικά δεδομένα**: ο agent διαβάζει απευθείας αγώνες, σκορ, σκόρερ, MVP, βαθμολογίες και τα κείμενα αγώνων. Τα posts για αγώνες βασίζονται σε γεγονότα και όχι σε ό,τι θα φανταζόταν το μοντέλο.
- **Ασφάλεια για το υπάρχον app**: όλοι οι νέοι πίνακες έχουν πρόθεμα `social_`. Το migration δεν αλλάζει και δεν σβήνει τίποτα από το Salonicup, και ξανατρέχει με ασφάλεια.

### Γιατί Messages API με δικό μας loop
Το Claude Managed Agents (η Anthropic φιλοξενεί το loop και ένα sandbox) θα μπορούσε να τρέξει τον agent. Εδώ όμως ο agent πρέπει:
- να γράφει στη δική μας βάση,
- να σταματά για εγκρίσεις και στο emergency stop ανάμεσα στα βήματα,
- να καταγράφει κάθε βήμα και το κόστος του.

Γι' αυτό το loop τρέχει στο backend (`runner.ts`, ~180 γραμμές).

---

## 2. Core Agent (Phase 1 — ενεργό)

- **Orchestrator**: λειτουργεί σαν ο social media manager του πρωταθλήματος. Εκτελεί, δεν περιγράφει. Κανόνες:
  - ποτέ δεν ισχυρίζεται μια ενέργεια χωρίς επιβεβαίωση από εργαλείο,
  - ποτέ δεν εφευρίσκει metrics ή ποδοσφαιρικά γεγονότα,
  - σέβεται τους παίκτες (ερασιτέχνες, πραγματικά πρόσωπα).
- **7 specialists** μέσω `delegate_to_specialist`. Ο orchestrator ελέγχει την έξοδό τους πριν τη χρησιμοποιήσει.
- **Εργαλεία**: `get_league_data`, `create_graphic`, `save_memory`, `search_memory`, `update_brand_profile`, `create_campaign`, `create_content_drafts` (με σύνδεση σε `match_id`), `list_content`, `update_content`, `schedule_content`, `get_recent_activity`, `delegate_to_specialist`, `web_search`.
- **Μνήμη**: brand profile + `social_memories` + ιστορικό συζητήσεων. Κάθε απόρριψη με αιτιολογία γίνεται αυτόματα «προτίμηση» στη μνήμη.
- **Όρια**: 20 βήματα / 240″ ανά εντολή και μηνιαίο όριο κόστους (προεπιλογή $50, αλλάζει στις Ρυθμίσεις). Κάθε κλήση στο Claude καταγράφεται με το κόστος της.

### Αυτονομία και εγκρίσεις (`lib/policy.ts`)
| Ενέργεια | Manual | Semi | Full | Emergency stop (αυτόνομα) | Emergency stop (chat) |
|---|---|---|---|---|---|
| Drafts, μνήμη, καμπάνιες | ✅ | ✅ | ✅ | ⛔ | ✅ |
| Προγραμματισμός | 🟡 έγκριση | ✅ | ✅ | ⛔ | 🟡 |
| Δημοσίευση | 🟡 | 🟡 | ✅ | ⛔ | 🟡 |
| Απάντηση σε σχόλιο | 🟡 | ✅ | ✅ | ⛔ | 🟡 |
| Ευαίσθητη απάντηση / διαγραφή | 🟡 | 🟡 | 🟡 | ⛔ | 🟡 |
| Αλλαγή brand | ✅ από chat · 🟡 αυτόνομα | ίδιο | ίδιο | 🟡 | ✅ |

### Αυτόματες εργασίες
- **Καθημερινά**:
  - Final Score drafts για όσους αγώνες έληξαν.
  - Matchday drafts για τους επόμενους αγώνες.
  - Έλεγχος του calendar για κενά.
- **Εβδομαδιαία**: οι ιστορίες της αγωνιστικής (ντέρμπι, κορυφή, σερί, ορόσημα σκόρερ) και το πλάνο περιεχομένου της επόμενης εβδομάδας.
- **Μηνιαία**: σύνοψη του πρωταθλήματος και των social, στρατηγική και καμπάνια για τον επόμενο μήνα.

---

## 3. Βάση δεδομένων

`supabase/migrations/0001_social.sql`:
- Ρυθμίσεις και brand σε μία γραμμή (`social_settings`).
- Μνήμη, καμπάνιες, περιεχόμενο, assets, εγκρίσεις, συζητήσεις, εκτελέσεις και βήματα του agent, ουρά εργασιών, προγραμματισμένες εργασίες, audit, κόστος AI.
- **RLS με `is_admin()`** του Salonicup. Οι εγκρίσεις, οι εκτελέσεις και το audit γράφονται μόνο από τον server.
- `social_tokens`: RLS χωρίς policies, AES-256-GCM στην εφαρμογή. Τα tokens δεν φτάνουν ποτέ στον browser.
- `social_activity`: δεν τροποποιείται και δεν διαγράφεται (trigger).
- `social_claim_jobs()` (`FOR UPDATE SKIP LOCKED`): idempotency keys, exponential backoff, dead-letter, απελευθέρωση εργασιών που κόλλησαν πάνω από 15′.

---

## 4. Αξιολόγηση integrations

> Τα όρια των πλατφορμών αλλάζουν συχνά. Οι τιμές παρακάτω προέρχονται από την τεκμηρίωση που γνωρίζω και **πρέπει να επαληθευτούν στην αρχή της Phase 3**.

### 4.1 Κόστος και προϋποθέσεις (εσωτερική χρήση)

| Integration | Κόστος | Τι χρειάζεται για ΔΙΚΟΥΣ σου λογαριασμούς | Κύριος περιορισμός |
|---|---|---|---|
| Claude API | Ανά χρήση | Το `ANTHROPIC_API_KEY` που ήδη έχει το Salonicup | Opus 5.5: $4/$20 ανά 1M tokens· web search $10/1.000 |
| Supabase | Κανένα επιπλέον | Το ίδιο project | — |
| Vercel | Κανένα επιπλέον (νέο project στο ίδιο repo) | Root Directory `social` | Hobby cron 1×/ημέρα → χρησιμοποιούμε pg_cron |
| Meta (Instagram + Facebook) | Δωρεάν | Meta App, εσύ ως admin της εφαρμογής και της Σελίδας· Instagram Professional συνδεδεμένο με τη Σελίδα | Για δικούς σου λογαριασμούς δεν χρειάζεται App Review· ~100 posts/24ω μέσω API |
| TikTok | Δωρεάν | Developer app· **audit** για δημόσια posts | Χωρίς audit τα posts μένουν ιδιωτικά· όχι watch time/demographics |
| YouTube (κανάλι SALTV) | Δωρεάν (quota) | Google Cloud project, OAuth | 10.000 units/ημέρα· χωρίς audit τα uploads είναι ιδιωτικά |
| LinkedIn | Δωρεάν | Έγκριση Community Management API | Χαμηλή προτεραιότητα για ένα πρωτάθλημα |
| AI εικόνες | ~$0.02–0.20 ανά εικόνα | API key παρόχου | Το κείμενο μέσα στην εικόνα δεν είναι αξιόπιστο → σκορ και ονόματα μπαίνουν από template |
| Video + υπότιτλοι | Container $5–20/μήνα + ~$0.006/λεπτό | FFmpeg worker | Δεν τρέχει σε Vercel functions |

### 4.2 Τι επιτρέπουν τα APIs

| Δυνατότητα | Instagram | Facebook | TikTok | YouTube | LinkedIn |
|---|---|---|---|---|---|
| Post εικόνας / carousel | ✅ | ✅ | ✅ photo | — | ✅ (με έγκριση) |
| Reels / Shorts / video | ✅ | ✅ | ✅ | ✅ | ✅ (με έγκριση) |
| Stories | ✅ | ✅ | — | — | — |
| Reach / views / engagement | ✅ | ✅ | Βασικά | ✅ | ✅ (με έγκριση) |
| Watch time / retention | Μερικά (Reels) | Μερικά | ❌ | ✅ | ❌ |
| Impressions / CTR thumbnail | — | — | — | ❌ (μόνο Studio) | — |
| Demographics | ✅ (100+ followers) | ✅ | ❌ | ✅ | ✅ |
| Σχόλια: ανάγνωση/απάντηση | ✅ | ✅ | Μόνο Business API | ✅ | ✅ |
| DMs | Περιορισμένα (24ω) | ✅ Messenger | ❌ | ❌ | ❌ |
| Άλλες διοργανώσεις (δημόσια) | ✅ Business Discovery | ❌ στην πράξη | ❌ | ✅ | ❌ |

**Δεν θα γίνει**: scraping, πρόσβαση σε ιδιωτικά δεδομένα, μη επίσημα APIs. Όπου ένα API δεν δίνει κάτι, ο agent το δηλώνει.

---

## 5. Roadmap

| Phase | Περιεχόμενο | Κατάσταση |
|---|---|---|
| **1** | Core Agent + 7 specialists, δεδομένα πρωταθλήματος, μνήμη, brand, admin-only πρόσβαση, εγκρίσεις, emergency stop, ουρά/scheduler, activity log, όριο κόστους, dashboard | ✅ Υλοποιημένο. Tests: 20 unit + 9 ομάδες DB tests σε PostgreSQL + build |
| **2α** | Creative Studio με τα σχέδια της καρτέλας Posts (+ τελικό σκορ, MVP)· εργαλείο `create_graphic`· Asset Library με απευθείας uploads έως 200 MB· γραφικά στο calendar | ✅ Υλοποιημένο. Tests: κάθε τύπος σε κάθε μέγεθος, ίδιος κώδικας με την καρτέλα, λεπτά/αυτογκόλ, άρνηση όταν λείπουν δεδομένα, σύγκριση pixel με την παλιά καρτέλα |
| **2β** | AI εικόνες, αφαίρεση φόντου, carousels πολλών σελίδων, video (clips από τα livestreams, υπότιτλοι, resize για Reels/Shorts/TikTok) | Χρειάζεται επιλογή παρόχου και FFmpeg worker |
| **3** | OAuth Instagram/Facebook/YouTube/TikTok, ανανέωση tokens, δημοσίευση, retries, κατάσταση δημοσίευσης | — |
| **4** | Συλλογή insights, Analytics, αναφορές, AI Performance Analyst | — |
| **5** | Optimization: A/B tests, ιστορικό αλλαγών στρατηγικής και αξιολόγησή τους, MCP server | — |
| **6** | Community Manager (σχόλια, μηνύματα, αιτήματα ομάδων/χορηγών), ανάλυση άλλων διοργανώσεων | — |

Η Phase 7 (SaaS, συνδρομές, πολλοί πελάτες) **αφαιρέθηκε**.

---

## 6. Γραφικά (Phase 2α)

Ο agent φτιάχνει **τα ίδια posts με την καρτέλα «Posts» του admin** (`/admin/post`), όχι δικά του σχέδια.

- **Κοινός κώδικας**: `app/admin/post/canvas.ts` (σχεδίαση) και `app/admin/post/build.ts` (δεδομένα: αγωνιστικές, playoff σκέλη, φόρμα, εβδομάδα, αποδόσεις, τελικό σκορ, MVP). Η καρτέλα τα τρέχει στον browser. Ο agent τα τρέχει στον server με `@napi-rs/canvas`, από αντίγραφο στο `social/lib/posts`.
- **Συγχρονισμός**: μετά από αλλαγή στην καρτέλα → `npm run sync:posts`. Ένα test αποτυγχάνει αν τα αντίγραφα διαφέρουν.
- **Τύποι**: Τελικό σκορ, MVP, Αναμέτρηση, Πρόγραμμα, Αποτελέσματα, Βαθμολογία, Εβδομάδα, Αποδόσεις. Μεγέθη: τετράγωνο, story, YouTube· Πρόγραμμα/Αποτελέσματα/Βαθμολογία μόνο τετράγωνα, όπως στην καρτέλα.
- **Ίδια εμφάνιση**: θέμα ανά πρωτάθλημα (`themeForLeague`), χορηγοί από `app_settings.sponsors`, Oswald. Στον server τα ελληνικά βγαίνουν με Roboto Condensed, μια στενή γραμματοσειρά όπως η fallback του browser. Έλεγχος pixel προς pixel: τα 6 υπάρχοντα posts βγαίνουν ίδια με πριν.
- **Βελτιώσεις που πήρε και η καρτέλα**: κεφαλαία χωρίς τόνους, όπως γράφονται στα ελληνικά, και δύο νέοι τύποι σχεδίων (τελικό σκορ, MVP). Οι νέοι τύποι δεν εμφανίζονται ακόμα στο μενού της καρτέλας.
- **Ακρίβεια**: σκόρερ με τα λεπτά όπως στο app (Β' ημίχρονο «5» = 35'), αυτογκόλ στην αντίπαλη ομάδα. Αν τα δεδομένα δεν στηρίζουν ένα post, π.χ. τελικό σκορ για αγώνα που δεν έληξε, δεν φτιάχνεται και ο agent παίρνει τον λόγο.
- **Αποθήκευση**: ιδιωτικό bucket `social-assets` και πίνακας `social_assets`· στο dashboard με προσωρινά signed URLs.
- **Περιορισμός**: στον server δεν μπαίνει το 📍 πριν από το γήπεδο στην Αναμέτρηση (δεν υπάρχει γραμματοσειρά emoji).

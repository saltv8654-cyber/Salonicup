# Salonicup — Τεχνικό Documentation

Τεκμηρίωση για developer. Καλύπτει αρχιτεκτονική, βάση, το σύστημα OBS overlay,
τη ροή του speaker, τα realtime κανάλια, το κείμενο αγώνα (AI), τα push, το PWA/Service
Worker και το deployment.

---

## 1. Επισκόπηση & Tech stack

PWA για ερασιτεχνικό πρωτάθλημα ποδοσφαίρου (Θεσσαλονίκη). Ζωντανή κάλυψη αγώνων με
πίνακα (speaker), δημόσιες σελίδες (βαθμολογία, πρόγραμμα, στατιστικά) και **OBS overlay**
για livestream (YouTube).

- **Next.js 14.2** (App Router, client + server components), **React 18**, TypeScript.
- **Supabase**: Postgres + Auth + Realtime + Storage (bucket `logos`).
- **Tailwind CSS** (utility classes· τα γραφικά του overlay είναι inline styles).
- **Anthropic SDK** (`claude-sonnet-5`) για το κείμενο αγώνα (με templated fallback).
- **web-push** (VAPID) για ειδοποιήσεις.
- **Hosting**: Vercel. **PWA**: `public/manifest.json` + `public/sw.js`.

---

## 2. Δομή repository (τα σημαντικά)

```
app/
  layout.tsx                 root layout (html/body, Toaster, SW register)
  page.tsx                   αρχική
  overlay/[matchId]/page.tsx ★ OBS overlay (το «γραφικό» της μετάδοσης)
  speaker/[matchId]/page.tsx ★ πίνακας σπίκερ (ζωντανή καταχώρηση)
  speaker/[matchId]/report.tsx  sheet κειμένου αγώνα
  match/[matchId]/page.tsx   δημόσια σελίδα αγώνα (ticker)
  admin/matches/page.tsx     διαχείριση αγώνων (+ forfeit 3-0)
  admin/post/page.tsx        δημιουργία post + ρύθμιση χορηγών (app_settings)
  standings / schedule / stats / search / team / player ...
  api/
    report/route.ts          ★ παραγωγή κειμένου αγώνα (AI ή fallback)
    push/*                   subscribe/unsubscribe/send/prefs/test
    admin/create-user/route.ts
    og/*                     Open Graph images
lib/
  clock.ts                   ρολόι (MM:SS), περίοδοι
  match.ts                   PERIODS, EVENTS, fmtMinute, tallies
  formations.ts              διατάξεις + slotCoords
  push.ts, time.ts, youtube.ts, types/
  hooks/useLiveMatch.ts      ★ ζωντανή σύνδεση αγώνα (realtime + polling)
  hooks/useNow.ts            τικ ρολογιού (self-correcting)
  hooks/useAuth.ts
  supabase/client.ts server.ts (anon + admin/service-role client)
schema.sql                   βασικό schema + triggers + views
supabase/app_settings.sql    πίνακας χορηγών (singleton)
public/sw.js                 ★ service worker (cache versioning)
middleware.ts                auth/session middleware
```

---

## 3. Environment variables

| Var | Πού | Σκοπός |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | anon key (public read + RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | admin client (report, push) — **ποτέ στον client** |
| `ANTHROPIC_API_KEY` | server only | κείμενο αγώνα με AI. **Αν λείπει → templated fallback** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | client + server | Web Push |
| `VAPID_PRIVATE_KEY` | server only | Web Push |

> **ΠΡΟΣΟΧΗ:** Χωρίς `ANTHROPIC_API_KEY` στο Vercel, το «Κείμενο αγώνα» βγάζει το
> εφεδρικό (template) κείμενο, όχι το ζωντανό AI ρεπορτάζ. Το κλειδί μπαίνει στα
> Vercel → Settings → Environment Variables (Production) και θέλει redeploy.

---

## 4. Βάση δεδομένων (Supabase)

Ολόκληρο το schema στο `schema.sql`. Κύριοι πίνακες: `leagues`, `teams`, `players`,
`venues`, `matches`, `events`, `profiles`, `slots`, plus `app_settings` (χορηγοί).

### 4.1 `matches` (τα σημαντικά πεδία)
- `league_id`, `round`, `match_date`, `venue_id`, `field`, `team_a`, `team_b`
- `goals_team_a/b`, `pens_team_a/b` — **υπολογίζονται από trigger** (βλ. 4.2)
- `match_status`: `Scheduled | Live | Played | Postponed | Forfeit`
- `clock_period`: `H1 | H2 | ET | PEN | HT | FT | null`, `clock_started_at` (ρολόι)
- `lineup_a/b` (uuid[] θέσεων), `formation_a/b`, `subs` (jsonb[]), `squad_a/b`
- `player_notes` (jsonb), `mvp_player_id`, `report` (text), `stream_url`

### 4.2 Trigger σκορ — `recalc_score()`
Fires `after insert/update/delete on events`. Υπολογίζει:
```
goals_team_a = #{GOAL από team_a} + #{OWN από team_b}   (period <> 'PEN')
goals_team_b = #{GOAL από team_b} + #{OWN από team_a}
pens_team_*  = #{PEN_SCORED} ανά ομάδα
```
**Σημαντικό:** το trigger τρέχει ΜΟΝΟ σε αλλαγές `events`. Επομένως γράψιμο απευθείας
στο `matches.goals_*` (π.χ. **νίκη στα χαρτιά 3-0** από το admin) **διατηρείται**.

### 4.3 `event_type` enum
`GOAL, OWN, ASSIST, YELLOW, RED, PEN_SCORED, PEN_MISSED`.
Το **αυτογκόλ (OWN)** αποθηκεύεται με `team_id` = ομάδα του παίκτη που το έβαλε· το
trigger το μετράει στην **αντίπαλη** ομάδα.

### 4.4 Views
- **standings** — από `matches` με `match_status in ('Played','Forfeit')`. Άρα οι νίκες
  στα χαρτιά (Forfeit 3-0) μετράνε κανονικά.
- **player stats** — goals/own_goals/assists/appearances από `events`.

### 4.5 RLS
Δημόσια ανάγνωση, εγγραφή με ρόλους (`is_admin()`, speaker). `app_settings`: public read,
admin write.

---

## 5. Auth & ρόλοι
Supabase Auth. `profiles.role ∈ {admin, speaker, ...}`. Guards μέσω `useAuth` +
`middleware.ts`. Οι σελίδες speaker/admin απαιτούν αντίστοιχο ρόλο.

---

## 6. Realtime αρχιτεκτονική

Δύο κανάλια ανά αγώνα:

1. **`match:${matchId}`** — `postgres_changes` σε `events` (*) και `matches` (UPDATE).
   Το `useLiveMatch` τραβάει ξανά δεδομένα σε κάθε αλλαγή. (Χρήση: speaker, overlay,
   δημόσια σελίδα αγώνα.)

2. **`overlay:${matchId}`** — broadcast event `flash`. Ο **speaker** στέλνει, το
   **overlay** ακούει. Payloads (`{ kind, ...extra }`):
   - `VAR` — κάρτα VAR
   - `LINEUPS` — προβολή συνθέσεων (Α΄ 5″, Β΄ 5″, auto-hide 10″)
   - `SCORERS` — πάνελ σκόρερ (4″ auto-hide)
   - `BRAND` `{ value }` — αλλαγή logo καναλιού (π.χ. `SALTV1`) ζωντανά
   - `LIVE` `{ on }` — on/off το παλλόμενο LIVE

`lib/hooks/useLiveMatch.ts` υλοποιεί: αρχικό fetch, subscribe, **auto-reconnect** σε
CHANNEL_ERROR/TIMED_OUT/CLOSED, **polling κάθε 12″** (δίχτυ αν πέσει το realtime),
refresh σε `visibilitychange`. Επίσης δεν σβήνει τα state σε προσωρινό σφάλμα
(κρατά τα προηγούμενα δεδομένα) και εκθέτει `lastSync` για watchdog.

---

## 7. OBS Overlay — `app/overlay/[matchId]/page.tsx`

Το «γραφικό» της μετάδοσης. Ανοίγει ως **Browser Source** στο OBS. Σχεδιαστικός καμβάς
**1280×720** (16:9), κλιμακώνεται για να καλύψει την οθόνη.

### 7.1 URL parameters
| Param | Τιμές | Σημασία |
|---|---|---|
| `scale` | float (default **1**) | μέγεθος scoreboard (1 = 100%) |
| `pos` | `tl\|tr\|bl\|br` (default `tl`) | γωνία scoreboard |
| `margin` | int | απόσταση από τη γωνία |
| `brand` | string (default `SALTV1`) | logo καναλιού πάνω-δεξιά (κενό = κανένα) |
| `live` | `0` για off | παλλόμενο LIVE (default on) |
| `sponsors` | csv από URLs | χορηγοί (αλλιώς από `app_settings`) |
| `theme` | `orange\|yellow\|miami` | (legacy per-league theme· το scoreboard πλέον PL palette) |
| `preview` | present | λειτουργία προεπισκόπησης (stage 16:9 + χειριστήρια) |

### 7.2 Rendering / scaling (σημαντικό)
- **Πραγματικό OBS** (`!preview`): `<div fixed 1280×720 transform:scale(realFit)>`.
  `realFit = max(innerWidth/1280, innerHeight/720)` — **cover**, ώστε οι γωνίες να κολλάνε
  σε **οποιαδήποτε** αναλογία source (ακόμη κι αν δεν είναι 16:9). `body/html overflow:hidden`.
  → Για τέλειο αποτέλεσμα, το Browser Source να είναι **1920×1080**.
- **Preview**: stage με `aspect-ratio:16/9`, σκηνή scaled με `pscale = stageWidth/1280`.
  Πιστό 1:1 με την τελική μετάδοση (ίδιο ποσοστό οθόνης).

### 7.3 Στοιχεία σκηνής
`scene = <>{styleTag}{sponsorsEl}{!lineupsOn && scoreEl}{brandEl}{subCardEl}{varEl}{lineupsEl}{scorersEl}{bigCardEl}</>`

- **scoreEl** — scoreboard (PL palette: βαθύ μωβ `#3d0a45/#26002c`, ματζέντα `#ff2882`).
  Δομή: ματζέντα ράβδος | ομάδα Α (σήμα+όνομα) | σκορ | ομάδα Β | ρολόι (MM:SS).
  Κάτω-**κέντρο του σκορ**: καρτελάκι πρωταθλήματος (θέση μετριέται με ref: `scoreCX`).
  `transform: scale(userScale)`.
- **brandEl** — πάνω-δεξιά: logo καναλιού (λευκό bold italic + ματζέντα γραμμή) + **LIVE**
  (κόκκινη κουκκίδα με keyframe `ovLive` — pulse/radar). Ελέγχεται από `brand`, `live` state.
- **lineupsEl** — συνθέσεις: καρτελάκι πρωταθλήματος + όνομα/διάταξη + γήπεδο (3/4 portrait,
  `LineupPitch`). Όταν προβάλλονται συνθέσεις **κρύβεται το scoreboard** (`!lineupsOn`)· η
  σύνθεση πάει ψηλά (top 24) και κλιμακώνεται (`scale 0.86`, `transformOrigin top center`,
  `place-items:start center`) ώστε να χωράει όλη + να μην ακουμπά τους χορηγούς (`bottom:90`).
- **scorersEl** — πάνελ σκόρερ ανά ομάδα (πλήρη ονόματα)· τα **αυτογκόλ** εμφανίζονται στην
  ομάδα που πήρε το +1 με 🔻 «(αυτ.)».
- **subCardEl / varEl / bigCardEl** — κάρτες αλλαγής / VAR / (ΕΝΑΡΞΗ·ΗΜΙΧΡΟΝΟ·ΤΕΛΙΚΟ).
  Το **ΗΜΙΧΡΟΝΟ** δείχνει σκορ **μόνο Α΄ ημιχρόνου** (γκολ period=H1), όχι το τρέχον.
- **popup** (goal/κάρτα) — auto από νέα `events` (<20″). Το GOAL/OWN σε ματζέντα· περιλαμβάνει
  ασίστ (ζευγάρωμα ASSIST ίδιας ομάδας/ημιχρόνου/λεπτού).
- **sponsorsEl** — κάτω-αριστερά «POWERED BY» + κυλιόμενα λογότυπα (marquee).

### 7.4 Auto γραφικά
- Popup γκολ/κάρτας από νέα `events`.
- Κάρτα αλλαγής από νέο στοιχείο στο `match.subs`.
- Big card (ΕΝΑΡΞΗ/ΗΜΙΧΡΟΝΟ/ΤΕΛΙΚΟ) από μεταβάσεις `clock_period`.

### 7.5 Ανθεκτικότητα (για μακρές μεταδόσεις σε OBS)
5 επίπεδα: (1) reconnect του main channel, (2) reconnect του flash channel, (3) polling 12″,
(4) instant refresh + snap ρολογιού σε `visibilitychange`, (5) **watchdog**: αν >70″ χωρίς
επιτυχή ενημέρωση (και είναι ορατό & έχει ήδη φορτώσει) → `location.reload()`.

### 7.6 Preview controls (χειριστήρια στησίματος)
Στη σελίδα preview: test-κουμπιά (Γκολ/Κάρτες/VAR/Συνθέσεις/Σκόρερς/Αλλαγή/Έναρξη/Ημίχρονο/
Τελικό), **slider μεγέθους**, θέση, επιλογή **Καναλιού** (SALTV1/2/3/Κανένα), **LIVE on/off**,
και **«Αντιγραφή OBS link»** που κουμπώνει `scale/pos/brand/live` στο URL.

---

## 8. Speaker panel — `app/speaker/[matchId]/page.tsx`

Δύο φάσεις: **squad** (στήσιμο σύνθεσης/διάταξης) → **live** (καταχώρηση).

- **Ρολόι** (`ClockBar`): Έναρξη Α΄ → Ημίχρονο → Έναρξη Β΄ → (Παράταση) → Λήξη. Γράφει
  `clock_period` + `clock_started_at` στο `matches`.
- **Καταχώρηση φάσης**: πάτα παίκτη → διάλεξε φάση (Γκολ/Ασίστ/Αυτογκόλ/Κίτρινη/Κόκκινη).
  Το λεπτό μπαίνει αυτόματα από το ρολόι αν δεν δοθεί. Πέναλτι: Εύστοχο/Άστοχο.
- **Λίστα vs Γήπεδο**: δύο όψεις καταχώρησης. Στη **Λίστα** οι βασικοί ξεχωρίζουν από τους
  **αναπληρωματικούς** με διαχωριστική γραμμή· με κάθε αλλαγή ο μπαίνων ανεβαίνει στους βασικούς.
- **Αλλαγές** (`subs`): και από τις δύο όψεις. Ενημερώνουν `lineup_*` + `subs[]`.
- **Edit event**: μολυβάκι δίπλα στο ✕ — αλλαγή παίκτη/είδους/λεπτού/ημιχρόνου + προσθήκη ασίστ.
- **Overlay controls**: VAR, Συνθέσεις, Σκόρερς (broadcast), + σειρά **ΚΑΝΑΛΙ (TV1/2/3/—) & LIVE**
  που στέλνουν ζωντανά `BRAND`/`LIVE` στο overlay.
- **OBS link**: «Αντιγραφή link» (με χορηγούς από localStorage) & «Προεπισκόπηση».
- **Λήξη αγώνα / Κείμενο αγώνα** → `ReportSheet`.

> Η επιλογή καναλιού/LIVE μέσω broadcast είναι **ephemeral**: αν κάνει reload το OBS, γυρνά
> στην τιμή του URL (default). Αν χρειαστεί persistence → αποθήκευση σε νέα στήλη `matches`.

---

## 9. Ρολόι / λεπτά / περίοδοι — `lib/clock.ts`, `lib/match.ts`

- **PERIODS**: H1 (0–30΄), H2 (30΄+), ET (παράταση), PEN. Καθυστερήσεις: `30+X'`.
- **clockLabel** → **MM:SS** παντού. `BASE_MIN = {H1:0, H2:30, ET:60}`,
  `total = BASE_MIN[period]*60 + elapsed`, elapsed από `clock_started_at`.
- **fmtMinute** → εμφάνιση λεπτού (π.χ. `3'`, `30+2'`, `ΠΕΝ`). **Δεν** γράφεται «α΄ ημίχ».
- **useNow** → τικ 1s + snap σε `visibilitychange` (self-correcting από timestamp).

---

## 10. Events, scoring & forfeit

- Σκορ = trigger `recalc_score` (βλ. 4.2). Αυτογκόλ → αντίπαλη ομάδα.
- **Forfeit / νίκη στα χαρτιά** (`app/admin/matches/page.tsx`): κατάσταση «Στα χαρτιά» →
  επιλογή νικήτριας → γράφεται **3-0 / 0-3 / 0-0** απευθείας στο `matches.goals_*`
  (pens 0). Μετράει στη βαθμολογία (view περιλαμβάνει `Forfeit`).

---

## 11. Κείμενο αγώνα — `app/api/report/route.ts`

`POST { matchId }` (μόνο admin/speaker). Χρησιμοποιεί **admin client** (service role).

- Χτίζει **κεφαλίδα**: `Πρωτάθλημα·Αγωνιστική / Ημερομηνία / Γήπεδο / Ομάδα Α vs Ομάδα Β /
  Ημίχρονο X-Y / Τελικό X-Y`. (Ημίχρονο = γκολ period=H1.)
- **Σώμα**: αν υπάρχει `ANTHROPIC_API_KEY` → `claude-sonnet-5` (system prompt με ύφος/χιούμορ,
  MVP μόνο αν δηλωμένος). Αλλιώς → `buildAutoNarrative()` (ρέον template, χωρίς λίστες).
- **Ουρά**: Σκόρερς/Ασίστ ανά ομάδα, MVP (αν δηλωμένος), πέναλτι (αν υπάρχουν).
- Αποθήκευση στο `matches.report`.

---

## 12. Χορηγοί (sponsors)
- Πηγή overlay: `?sponsors=` (csv URLs) αλλιώς `app_settings.sponsors` (id=1).
- Ρύθμιση: `app/admin/post/page.tsx` — upload logos → `syncSponsors()` κάνει **upsert στο
  `app_settings`** (RLS: admin write). Το overlay τα ξαναδιαβάζει **κάθε 30″** + σε
  `visibilitychange`, ώστε να εμφανίζονται χωρίς reload.
- Storage bucket: `logos` (public URLs).

---

## 13. Push notifications (VAPID)
`lib/push.ts` + `app/api/push/*`. Subscribe/unsubscribe/prefs/send/test. Ειδοποιήσεις σε
έναρξη αγώνα, **γκολ** (και **αυτογκόλ** → στην ωφελημένη ομάδα), κόκκινη. Το SW χειρίζεται
`push` + `notificationclick`.

---

## 14. PWA / Service Worker — `public/sw.js`
- `const CACHE = 'salonicup-vNN'` — **αυξάνεται σε ΚΑΘΕ deploy** για invalidation.
- Στρατηγική: hashed static (`/_next/static`, εικόνες/fonts) **cache-first**· πλοήγηση
  **network-first** με fallback· τρίτα hosts (Supabase) πάνε κατευθείαν δίκτυο (χωρίς cache).
- Install: cache app shell· Activate: σβήσιμο παλιών caches.

> Στο OBS, μετά από νέο deploy: δεξί κλικ στο Browser Source → **Refresh cache of current page**.

---

## 15. Build & Deploy
- **Vercel** (Next 14). Deploy από `main`.
- Απαιτούμενα env (§3). Χωρίς `ANTHROPIC_API_KEY` → fallback κείμενο.
- Ροή αυτού του project: development branch → fast-forward `main`. **Bump `CACHE` στο
  `sw.js` σε κάθε αλλαγή που αγγίζει client assets.**
- SQL: `schema.sql` (μία φορά) + `supabase/app_settings.sql` (μία φορά).

---

## 16. Γνωστά όρια / TODO
- **OBS Browser Source = 1920×1080** για τέλεια στοίχιση (το cover-fit βοηθά, αλλά μη-16:9
  source δίνει pillarbox από το ίδιο το OBS).
- Επιλογή **Καναλιού/LIVE** ephemeral (χάνεται σε OBS reload). Persistence → στήλη στο `matches`.
- Το **Ημίχρονο** στο κείμενο/κάρτα προϋποθέτει ότι ο σπίκερ άλλαξε σε Β΄ ημίχρονο στο ρολόι
  (αλλιώς τα γκολ μένουν στο H1).
- **Χορηγοί**: πρέπει να είναι αποθηκευμένοι στο `app_settings` (όχι μόνο localStorage) για να
  φανούν στο OBS.

---

*Το αρχείο αυτό συνοδεύει τον κώδικα· ανανεώνεται μαζί με το app.*

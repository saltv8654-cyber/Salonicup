# billi

Ανεβάζεις τον λογαριασμό ρεύματος (PDF ή φωτογραφία). Το billi διαβάζει κατανάλωση, πρόγραμμα και χρεώσεις,
υπολογίζει πόσο θα πλήρωνες τον χρόνο σε κάθε πρόγραμμα και προτείνει ποιο χρώμα τιμολογίου σε συμφέρει.

Πλάνο: ρεύμα → φυσικό αέριο → internet / κινητή.

## Εκκίνηση

```bash
cp .env.example .env.local   # βάλε το ANTHROPIC_API_KEY
npm install
npm run dev
```

## Πώς δουλεύει

- `app/api/analyze/route.ts`: δέχεται το αρχείο, το στέλνει στο Claude (PDF απευθείας, χωρίς pdftotext) και
  επιστρέφει τα στοιχεία του λογαριασμού, προειδοποιήσεις και σύγκριση.
- `lib/extract.ts`: prompt, κανονικοποίηση και έλεγχοι (π.χ. αν τα επιμέρους ποσά βγάζουν το σύνολο).
- `lib/compare.ts`: ετήσια εκτίμηση και κόστος ανά πρόγραμμα (πάγιο × 12 + kWh × τιμή, με ΦΠΑ 6%).
  Συγκρίνονται μόνο οι χρεώσεις προμήθειας. Οι ρυθμιζόμενες χρεώσεις είναι ίδιες σε όλους τους παρόχους.
- `data/tariffs.json`: οι τιμές των παρόχων.

## Χρώματα τιμολογίων (ΡΑΑΕΥ)

| | |
|---|---|
| 🔵 Μπλε | Σταθερή τιμή |
| 🟢 Πράσινο | Κυμαινόμενη, ανακοινώνεται την 1η κάθε μήνα |
| 🟡 Κίτρινο | Κυμαινόμενη με βάση τη χονδρεμπορική, γνωστή μετά την κατανάλωση |
| 🟠 Πορτοκαλί | Δυναμική ωριαία, απαιτεί έξυπνο μετρητή |

## Ενημέρωση τιμών (χειροκίνητη)

Ο συγχρονισμός τρέχει μόνο όταν ανοίξεις το `/api/sync?key=<CRON_SECRET>`. Το `lib/sync.ts` ζητά από το Claude
Haiku 5.5, με web search και web fetch, τα τρέχοντα οικιακά τιμολόγια κάθε παρόχου της λίστας `PROVIDERS`. Με
`&model=sonnet` τρέχει με το Claude Sonnet 5.5, που είναι πιο ακριβό αλλά πιο διεξοδικό. Οι τιμές ελέγχονται (λογικά
όρια €/kWh και πάγιου) και αποθηκεύονται στο Vercel Blob (`tariffs/latest.json`). Αν ένας πάροχος αποτύχει,
κρατιούνται οι τιμές του από τον προηγούμενο συγχρονισμό.

Ρυθμίσεις στο Vercel (project billi):
- **Storage → Create → Blob** (Public) και σύνδεση στο project. Προσθέτει αυτόματα το `BLOB_READ_WRITE_TOKEN`.
- **Environment Variables:** `CRON_SECRET`, μια τυχαία μεγάλη φράση.

Για καθημερινό συγχρονισμό αργότερα: `vercel.json` με `{"crons":[{"path":"/api/sync","schedule":"0 4 * * *"}]}`.
Το Vercel Cron στέλνει το `CRON_SECRET` ως `Authorization: Bearer`.

Αν δεν υπάρχει Blob store, χρησιμοποιείται το `data/tariffs.json`.

## Leads, CRM και στατιστικά

- **Φόρμα επικοινωνίας:** κουμπιά «Θέλω αυτό το πρόγραμμα» και «Να με καλέσετε». Στέλνει στο `/api/leads` μαζί
  με τη σύνοψη της ανάλυσης και την πηγή (UTM/referrer). Ο λογαριασμός ως αρχείο δεν αποθηκεύεται.
- **CRM:** `/admin` (κωδικός `ADMIN_PASSWORD`). Περιλαμβάνει:
  - λίστα πελατών και κατάσταση (Νέο → Επικοινωνία → Προσφορά → Υπογραφή → Ενεργό / Χάθηκε),
  - ιστορικό επικοινωνίας, προμήθεια, επόμενη κλήση,
  - εξαγωγή CSV,
  - στατιστικά: πορεία επισκεπτών, πηγές, προγράμματα που πατήθηκαν.
- **Ειδοποίηση:** μήνυμα Telegram σε κάθε νέο lead (προαιρετικό).
- **Tracking:**
  - `/api/track` με ανώνυμο κωδικό στο localStorage, χωρίς cookies διαφήμισης,
  - Vercel Web Analytics (ενεργοποίηση από το Vercel → Analytics).
- **Πολιτική απορρήτου:** `/privacy`.

### Ρύθμιση (μία φορά)

1. Νέο project στο [Supabase](https://supabase.com) → **SQL Editor** → εκτέλεση του `supabase/schema.sql`.
2. Μεταβλητές περιβάλλοντος στο Vercel (project billi):

| Μεταβλητή | Από πού |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (μυστικό, ποτέ στον browser) |
| `ADMIN_PASSWORD` | δικός σου ισχυρός κωδικός για το `/admin` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | προαιρετικά: bot από τον @BotFather και το chat id σου |
| `NEXT_PUBLIC_CONTACT_PHONE` | τηλέφωνο για Κλήση / Viber / WhatsApp |
| `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_COMPANY_VAT` | για την Πολιτική Απορρήτου |

Οι `NEXT_PUBLIC_*` μπαίνουν στη σελίδα κατά το build, οπότε μετά από αλλαγή χρειάζεται Redeploy.

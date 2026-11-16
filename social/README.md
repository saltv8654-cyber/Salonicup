# Social Agent — Autonomous AI Social Media Manager

Ξεχωριστό Next.js app μέσα στο repo του Salonicup (όπως το `billi/`). Multi-tenant από την αρχή: το Salonicup είναι η πρώτη επιχείρηση.
Αρχιτεκτονική, κόστη, όρια APIs και roadmap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Τι λειτουργεί σήμερα (Phase 1)

| Ενεργό | Χρειάζεται credentials | Δεν έχει υλοποιηθεί ακόμα |
|---|---|---|
| AI Agent chat με 7 specialists και web search | `ANTHROPIC_API_KEY` | Γραφικά/video (Phase 2) |
| Δημιουργία drafts, καμπανιών, content calendar | Supabase keys | Σύνδεση λογαριασμών & δημοσίευση (Phase 3) |
| Μόνιμη μνήμη ανά επιχείρηση, μάθηση από απορρίψεις | `CRON_SECRET` για τις αυτόματες εργασίες | Analytics & reports (Phase 4) |
| Εγκρίσεις, 3 επίπεδα αυτονομίας, emergency stop | | A/B tests, MCP server (Phase 5) |
| Αυτόματες εργασίες (ημέρα/εβδομάδα/μήνας) με ουρά & retries | | Σχόλια, ανταγωνιστές (Phase 6) |
| Πολλοί οργανισμοί/επιχειρήσεις, ρόλοι, RLS, activity log, AI usage | | Stripe (Phase 7) |

## Εγκατάσταση

1. **Supabase** (Pro συνιστάται για 24/7) → SQL Editor → τρέξε `supabase/migrations/0001_core.sql` (ξανατρέχει με ασφάλεια).
2. **Auth**: Authentication → URL Configuration → πρόσθεσε `https://<domain>/auth/callback` στα Redirect URLs.
3. **Μεταβλητές** (`.env.example` → `.env.local` ή Vercel → Environment Variables):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
   `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`).
4. **Vercel**: νέο project από το ίδιο repo με **Root Directory = `social`**.
5. **Background worker** κάθε 5 λεπτά (το Vercel Hobby cron τρέχει μόνο μία φορά τη μέρα). Supabase → Database → Extensions: `pg_cron`, `pg_net`, και μετά:
   ```sql
   select cron.schedule('social-agent-tick', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://<domain>/api/worker/tick',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
       timeout_milliseconds := 300000);
   $$);
   ```
6. Άνοιξε το app → εγγραφή → δημιουργία οργανισμού και επιχείρησης → συμπλήρωσε το brand profile → ενεργοποίησε τις αυτόματες εργασίες στα Settings.

## Ανάπτυξη και tests

```bash
npm install
npm run dev          # http://localhost:3100
npm run typecheck
npm test             # unit tests: policy, ουρά, scheduler/DST, κρυπτογράφηση, εργαλεία agent
npm run test:db      # schema + RLS σε προσωρινό PostgreSQL (χρειάζεται τοπικό postgres)
npm run build
```

## Δομή

```
lib/agent/runner.ts     agent loop: Claude, εργαλεία, specialists, όρια, κόστος, emergency stop
lib/agent/tools.ts      εργαλεία του agent (zod validation, scoping ανά επιχείρηση, έλεγχος αυτονομίας)
lib/agent/prompts.ts    orchestrator, 7 specialists, prompts αυτόματων εργασιών
lib/agent/context.ts    business context (brand, μνήμη, λογαριασμοί, calendar, κατάσταση συστήματος)
lib/policy.ts           ρόλοι, αυτονομία, kill switches, όρια χρήσης
lib/jobs/worker.ts      schedules → jobs, εκτέλεση με retries/backoff/dead-letter
lib/integrations.ts     τι είναι ενεργό / χρειάζεται credentials / δεν υποστηρίζεται
supabase/migrations     σχήμα, RLS, ουρά
app/b/[businessId]/*    dashboard
```

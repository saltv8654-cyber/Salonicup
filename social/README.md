# Salonicup Social Agent

Ο AI agent που διαχειρίζεται τα social media του Salonicup. Είναι ξεχωριστό Next.js app μέσα στο repo (όπως το `billi/`) και χρησιμοποιεί **την ίδια βάση Supabase και τους ίδιους admins** με το Salonicup.
Αρχιτεκτονική, κόστη, όρια των APIs και roadmap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Τι λειτουργεί σήμερα (Phase 1)

| Ενεργό | Χρειάζεται ρύθμιση | Δεν έχει υλοποιηθεί ακόμα |
|---|---|---|
| AI Agent chat με 7 specialists και web search | Migrations στο Supabase (0001, 0002) | AI εικόνες, video (Phase 2β) |
| Διαβάζει αγώνες, αποτελέσματα, σκόρερ, MVP, βαθμολογίες από τη βάση | `CRON_SECRET` + pg_cron για τις αυτόματες εργασίες | Σύνδεση λογαριασμών και δημοσίευση (Phase 3) |
| Drafts (Matchday, Final Score κ.λπ.), καμπάνιες, content calendar | | Analytics και αναφορές (Phase 4) |
| **Γραφικά** με τα σχέδια της καρτέλας Posts (+ τελικό σκορ, MVP), από το Studio και τον agent | | |
| Asset Library με uploads έως 200 MB | | |
| Μόνιμη μνήμη, μάθηση από απορρίψεις | | A/B tests, MCP server (Phase 5) |
| Εγκρίσεις, 3 επίπεδα αυτονομίας, emergency stop, όριο κόστους | | Σχόλια, άλλες διοργανώσεις (Phase 6) |
| **Κάθε Πέμπτη: πρόγραμμα εβδομάδας ανά πρωτάθλημα** (τετράγωνο + story + λεζάντα), χωρίς AI | Ενεργοποίηση στις Ρυθμίσεις | Αυτόματη δημοσίευση (Phase 3) |
| **Κάθε Δευτέρα: βαθμολογία ανά πρωτάθλημα** (τετράγωνο + story + λεζάντα), χωρίς AI | Ενεργοποίηση στις Ρυθμίσεις | |
| Αυτόματες εργασίες (ημέρα/εβδομάδα/μήνα) με ουρά και retries | | |

## Εγκατάσταση

1. **Supabase του Salonicup** → SQL Editor → τρέξε με τη σειρά τα `supabase/migrations/0001_social.sql`, `0002_creative.sql`, `0003_weekly_program.sql` και `0004_weekly_standings.sql`. Φτιάχνουν μόνο πίνακες `social_*` και το ιδιωτικό bucket `social-assets`· δεν πειράζουν τίποτα υπάρχον και ξανατρέχουν με ασφάλεια.
2. **Vercel** → New Project από το ίδιο repo, με **Root Directory = `social`**.
3. **Environment Variables**:
   - Ίδια με του Salonicup: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.
   - Νέα: `CRON_SECRET` (τυχαίο string) και `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`).
4. **Background worker κάθε 5 λεπτά**: Supabase → Database → Extensions → ενεργοποίησε `pg_cron` και `pg_net`, και μετά:
   ```sql
   select cron.schedule('social-agent-tick', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://<domain του social agent>/api/worker/tick',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
       timeout_milliseconds := 300000);
   $$);
   ```
5. Άνοιξε το app και μπες με τον admin λογαριασμό του Salonicup. Συμπλήρωσε το brand στις **Ρυθμίσεις** και ενεργοποίησε τις αυτόματες εργασίες.

## Ανάπτυξη και tests

```bash
npm install
npm run dev          # http://localhost:3100
npm run typecheck
npm test             # policy, ουρά, scheduler/DST, κρυπτογράφηση, εργαλεία agent, δεδομένα πρωταθλήματος, γραφικά
GRAPHICS_OUT=./out npm test   # αποθηκεύει και τα PNG όλων των templates για οπτικό έλεγχο
npm run test:db      # σχήμα + RLS σε προσωρινό PostgreSQL (χρειάζεται τοπικό postgres)
npm run build
npm run sync:posts   # μετά από αλλαγή στην καρτέλα Posts του admin
```

## Δομή

```
lib/agent/runner.ts     agent loop: Claude, εργαλεία, specialists, όρια, κόστος, emergency stop
lib/agent/tools.ts      εργαλεία του agent (zod validation, έλεγχος αυτονομίας)
lib/agent/prompts.ts    orchestrator, 7 specialists, prompts αυτόματων εργασιών
lib/agent/context.ts    τι ξέρει ο agent σε κάθε εκτέλεση (brand, μνήμη, calendar, πρωτάθλημα, κατάσταση)
lib/posts/canvas.ts     ΑΝΤΙΓΡΑΦΟ του app/admin/post/canvas.ts (σχεδίαση) — npm run sync:posts
lib/posts/build.ts      ΑΝΤΙΓΡΑΦΟ του app/admin/post/build.ts (δεδομένα των posts)
lib/posts/render.ts     φόρτωση δεδομένων + fonts και σχεδίαση στον server (@napi-rs/canvas)
lib/salonicup.ts        ανάγνωση αγώνων/αποτελεσμάτων/βαθμολογιών/σκόρερ από τη βάση του Salonicup
lib/policy.ts           αυτονομία, emergency stop, όριο κόστους
lib/jobs/worker.ts      schedules → jobs, εκτέλεση με retries/backoff/dead-letter
lib/integrations.ts     τι είναι ενεργό / χρειάζεται ρύθμιση / δεν υποστηρίζεται
supabase/migrations     πίνακες social_*, RLS, ουρά
app/(dash)/*            dashboard
```

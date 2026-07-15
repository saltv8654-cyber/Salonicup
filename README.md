# Salonicup — Οδηγίες για Claude Code

Πλήρες Next.js 14 app για ερασιτεχνικό πρωτάθλημα ποδοσφαίρου.
Ο κώδικας είναι έτοιμος. Χρειάζεται μόνο ρύθμιση και deploy.

---

## Τι είναι αυτό

Web app / PWA με:
- **Δημόσιο**: βαθμολογία (με στήλη αναβολών ΑΝΒ), ρόστερ ομάδων, προφίλ παικτών, αγώνες, πρόγραμμα γηπέδων με κενά slots
- **Speaker panel**: ζωντανή καταχώρηση αγώνα — συμμετοχές (μέσα/έξω), φάσεις με περιόδους (Α'/Β'/Παράταση/Πέναλτι), αυτόματη αλυσίδα γκολ→ασίστ, AI κείμενο αγώνα
- **Admin**: CRUD για πρωταθλήματα, ομάδες, παίκτες, αγώνες, γήπεδα, χρήστες
- **Realtime**: όποιος βλέπει έναν live αγώνα, ενημερώνεται αυτόματα (Supabase Realtime)

## Δομή αγώνα (σημαντικό)
- 30' + 30', καθυστερήσεις 5' ανά ημίχρονο, παράταση 5' (μία περίοδος), πέναλτι 5-5
- Ο speaker γράφει λεπτό **σχετικό με το ημίχρονο** (1–30). Πάνω από 30 → καθυστερήσεις (30+3, 60+2)
- Το `lib/match.ts` έχει όλη τη λογική (`fmtMinute`, `PERIODS`)

---

## ΒΗΜΑΤΑ ΕΓΚΑΤΑΣΤΑΣΗΣ

### 1. Supabase — βάση δεδομένων
Στο Supabase → **SQL Editor** → τρέξε ολόκληρο το `schema.sql`.
Σβήνει ό,τι υπάρχει και τα ξαναχτίζει καθαρά (tables, views, RLS, triggers, realtime).

### 2. Supabase — Storage buckets
Στο Supabase → **Storage** → φτιάξε δύο **public** buckets:
- `players` (φωτογραφίες παικτών)
- `logos` (σήματα ομάδων/πρωταθλημάτων)

### 3. Supabase — πρώτος admin
Αφού φτιαχτεί ο πρώτος χρήστης (μέσω Authentication → Add user, ή signup),
τρέξε στο SQL Editor:
```sql
update profiles set role = 'admin' where email = 'saltv8654@gmail.com';
```

### 4. Μεταβλητές περιβάλλοντος
Αντίγραψε το `.env.local.example` σε `.env.local` και συμπλήρωσε:
```
NEXT_PUBLIC_SUPABASE_URL=      # Supabase → Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Supabase → Settings → API → anon/publishable key
SUPABASE_SERVICE_ROLE_KEY=     # Supabase → Settings → API → service_role key (ΜΥΣΤΙΚΟ)
ANTHROPIC_API_KEY=             # console.anthropic.com → API keys
```

### 5. Τοπικό τρέξιμο (δοκιμή)
```bash
npm install
npm run dev
```
Άνοιξε http://localhost:3000

### 6. GitHub
```bash
git init
git add .
git commit -m "Salonicup app"
git remote add origin https://github.com/saltv8654-cyber/salonicup.git
git branch -M main
git push -u origin main
```

### 7. Vercel
1. vercel.com → New Project → import το `saltv8654-cyber/salonicup`
2. Framework: Next.js (αυτόματο)
3. **Environment Variables**: πρόσθεσε και τα 4 από το βήμα 4
4. Deploy

---

## ΜΕΤΑ ΤΟ DEPLOY

### Εικονίδια PWA
Βάλε `icon-192.png` και `icon-512.png` στο `public/`
(από το σήμα Salonicup, τετράγωνα). Ήδη δηλωμένα στο `manifest.json`.

### Πρώτη χρήση
1. Μπες στο `/admin` (ως admin)
2. Πρόσθεσε: Πρωταθλήματα → Γήπεδα → Ομάδες → Παίκτες → Αγώνες
3. Φτιάξε speakers από Χρήστες → + Speaker
4. Ο speaker μπαίνει στο `/speaker`, ανοίγει αγώνα, καταγράφει

---

## ΤΙ ΕΜΕΙΝΕ ΓΙΑ ΑΡΓΟΤΕΡΑ (δεν εμποδίζουν το deploy)

- **Σύνδεση με salonicup.gr (WordPress)**: το site τρέχει WordPress + SportsPress.
  Θα χρειαστεί Application Password και αντιστοίχιση ID. Δεν υλοποιήθηκε ακόμα.
- **OBS overlay**: ξεχωριστή διάφανη σελίδα `/overlay/[matchId]` ως Browser Source.
  Απλό, θα προστεθεί ξεχωριστά.
- **Slots προγράμματος**: ο πίνακας `slots` υπάρχει. Χρειάζεται UI στο admin για μαζική
  δημιουργία (προαιρετικό — μπορούν να μπουν και χειροκίνητα στη βάση προς το παρόν).
- **Αρχηγοί**: ο ρόλος `captain` υπάρχει στη βάση. Οθόνες αρχηγών δεν έγιναν ακόμα.

## Στοίβα
Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + Storage +
Realtime) · Anthropic SDK (κείμενα αγώνων, μοντέλο claude-sonnet-4-6)

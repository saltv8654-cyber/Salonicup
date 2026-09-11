import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Πολιτική Απορρήτου — Salonicup',
  description: 'Πολιτική απορρήτου της εφαρμογής Salonicup.',
}

const UPDATED = '11 Σεπτεμβρίου 2026'
const CONTACT = 'saltv8654@gmail.com'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[15px] font-extrabold text-chalk mb-2">{title}</h2>
      <div className="text-[13.5px] leading-relaxed text-silver flex flex-col gap-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-pitch">
      <header className="px-4 pt-6 pb-4 border-b border-chalk/[0.06]">
        <div className="max-w-2xl mx-auto">
          <Link href="/" className="text-[11px] font-bold text-lit">← Αρχική</Link>
          <p className="text-[9.5px] tracking-[0.22em] uppercase text-lit font-extrabold mt-3">Salonicup</p>
          <h1 className="text-2xl font-extrabold text-chalk mt-1 tracking-tight">Πολιτική Απορρήτου</h1>
          <p className="text-[11px] text-dim mt-1">Τελευταία ενημέρωση: {UPDATED}</p>
        </div>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto pb-16">
        <p className="text-[13.5px] leading-relaxed text-silver mb-6">
          Η εφαρμογή <strong className="text-chalk">Salonicup</strong> («η Εφαρμογή») είναι μια πλατφόρμα για την
          παρακολούθηση και διαχείριση ερασιτεχνικού πρωταθλήματος ποδοσφαίρου στη Θεσσαλονίκη. Σεβόμαστε το
          απόρρητό σας. Η παρούσα πολιτική εξηγεί ποια δεδομένα συλλέγουμε, γιατί, και τα δικαιώματά σας.
        </p>

        <Section title="1. Δεδομένα που συλλέγουμε">
          <p>Ανάλογα με το πώς χρησιμοποιείτε την Εφαρμογή, ενδέχεται να συλλέγουμε:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li><strong className="text-chalk">Στοιχεία λογαριασμού:</strong> διεύθυνση email και όνομα, όταν κάνετε εγγραφή/σύνδεση (αρχηγοί ομάδων, διαχειριστές, εκφωνητές).</li>
            <li><strong className="text-chalk">Δεδομένα διοργάνωσης:</strong> ονόματα ομάδων/παικτών, αγώνες, σκορ, στατιστικά και πρόγραμμα — τα οποία είναι ως επί το πλείστον δημόσια.</li>
            <li><strong className="text-chalk">Ειδοποιήσεις (push):</strong> εφόσον τις ενεργοποιήσετε, αποθηκεύουμε ένα τεχνικό «token» της συσκευής σας ώστε να λαμβάνετε ειδοποιήσεις. Δεν συνδέεται με άλλα προσωπικά στοιχεία πέρα από τον λογαριασμό σας.</li>
            <li><strong className="text-chalk">Τεχνικά δεδομένα:</strong> βασικές πληροφορίες λειτουργίας (π.χ. τύπος συσκευής/προγράμματος περιήγησης) για τη σταθερότητα της Εφαρμογής.</li>
          </ul>
          <p>Δεν συλλέγουμε τοποθεσία, επαφές, φωτογραφίες ή στοιχεία πληρωμών.</p>
        </Section>

        <Section title="2. Πώς χρησιμοποιούμε τα δεδομένα">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>Για τη λειτουργία της διοργάνωσης: πρόγραμμα, βαθμολογίες, στατιστικά, αναμετρήσεις.</li>
            <li>Για την ταυτοποίηση αρχηγών/διαχειριστών και τις ενέργειές τους (π.χ. αιτήματα αλλαγής ώρας/αναβολής).</li>
            <li>Για την αποστολή ειδοποιήσεων που έχετε ζητήσει (αλλαγές αγώνων, αποτελέσματα).</li>
          </ul>
          <p>Δεν πουλάμε και δεν ενοικιάζουμε τα προσωπικά σας δεδομένα σε τρίτους.</p>
        </Section>

        <Section title="3. Πάροχοι υπηρεσιών">
          <p>Η Εφαρμογή στηρίζεται σε αξιόπιστους τρίτους παρόχους αποκλειστικά για τη λειτουργία της:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li><strong className="text-chalk">Supabase</strong> — βάση δεδομένων, ταυτοποίηση χρηστών και αποθήκευση.</li>
            <li><strong className="text-chalk">Vercel</strong> — φιλοξενία της εφαρμογής.</li>
            <li><strong className="text-chalk">Υπηρεσίες push</strong> (Apple/Google/browser) — παράδοση ειδοποιήσεων.</li>
          </ul>
          <p>Οι πάροχοι αυτοί επεξεργάζονται δεδομένα για λογαριασμό μας υπό τους δικούς τους όρους απορρήτου.</p>
        </Section>

        <Section title="4. Διατήρηση δεδομένων">
          <p>
            Διατηρούμε τα δεδομένα όσο είναι απαραίτητο για τη λειτουργία της διοργάνωσης. Μπορείτε να ζητήσετε
            τη διαγραφή του λογαριασμού σας και των σχετικών προσωπικών στοιχείων ανά πάσα στιγμή.
          </p>
        </Section>

        <Section title="5. Τα δικαιώματά σας (GDPR)">
          <p>Έχετε δικαίωμα πρόσβασης, διόρθωσης, διαγραφής και περιορισμού της επεξεργασίας των προσωπικών σας δεδομένων. Για οποιοδήποτε αίτημα, επικοινωνήστε μαζί μας.</p>
        </Section>

        <Section title="6. Παιδιά">
          <p>Η Εφαρμογή δεν απευθύνεται σε παιδιά κάτω των 13 ετών και δεν συλλέγουμε εν γνώσει μας δεδομένα τους.</p>
        </Section>

        <Section title="7. Αλλαγές στην πολιτική">
          <p>Ενδέχεται να επικαιροποιήσουμε την παρούσα πολιτική. Η ημερομηνία «Τελευταία ενημέρωση» στην κορυφή δείχνει την πιο πρόσφατη έκδοση.</p>
        </Section>

        <Section title="8. Επικοινωνία">
          <p>
            Για ερωτήματα σχετικά με το απόρρητο ή αιτήματα διαγραφής δεδομένων:{' '}
            <a href={`mailto:${CONTACT}`} className="text-lit font-bold underline">{CONTACT}</a>
          </p>
        </Section>
      </main>
    </div>
  )
}

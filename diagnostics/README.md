# SaloniCup Diagnostic Kit 🩺

Ένα εργαλείο για Windows που ελέγχει το laptop του livestream και βγάζει
πλήρη αναφορά (CPU, RAM, SSD/SMART, internet/WiFi, USB & κάμερες, GPU/drivers,
θερμοκρασίες, ανάλυση OBS logs, benchmark) με έτοιμα «findings» και προτάσεις.

## Πώς τρέχει (στο laptop)

1. Κατέβασε τον φάκελο `diagnostics/` από το GitHub στο laptop
   (Code → Download ZIP, ή clone) — χρειάζεσαι **2 αρχεία** στον ίδιο φάκελο:
   - `SaloniCup-Diagnostic.bat`
   - `SaloniCup-Diagnostic.ps1`
2. **Διπλό κλικ** στο `SaloniCup-Diagnostic.bat`.
3. Πάτα **«Ναι»** στο παράθυρο δικαιωμάτων διαχειριστή (χρειάζεται για SMART,
   θερμοκρασίες, drivers).
4. Περίμενε 1–2 λεπτά. Στο τέλος ανοίγει αυτόματα η αναφορά στο Notepad και
   αποθηκεύεται στην **Επιφάνεια Εργασίας** ως `SaloniCup-Report_ΗΜΕΡΟΜΗΝΙΑ.txt`.

> Συμβουλή: για να δει το OBS τα σωστά στοιχεία, τρέξε το **αφού** έχεις κάνει
> μία δοκιμαστική μετάδοση (ώστε να υπάρχει φρέσκο OBS log να αναλυθεί).
> Σύνδεσε και το iPhone/κάμερα πριν το τρέξεις, για να εμφανιστεί στα USB.

## Τι ελέγχει

| Τομέας | Τι δείχνει |
|---|---|
| CPU | μοντέλο, πυρήνες, φορτίο τώρα, top processes, benchmark |
| RAM | σύνολο/ελεύθερη, top processes μνήμης |
| SSD/HDD | μοντέλο, υγεία, **SMART** (θερμοκρασία/φθορά/σφάλματα), ταχύτητα |
| Internet | WiFi σήμα, latency, ISP, ταχύτητα download |
| USB/Κάμερες | συσκευές κάμερας & προβλήματα USB |
| GPU/Drivers | κάρτα, έκδοση/ημ. driver, συσκευές με σφάλμα |
| Θερμοκρασίες | αν τις εκθέτει το laptop (αλλιώς προτείνει HWiNFO64) |
| OBS | ανάλυση του πιο πρόσφατου log: ρυθμίσεις + lagged/skipped/dropped frames |

## Findings

Στην κορυφή της αναφοράς βγαίνει σύνοψη `[!]` προειδοποιήσεων, π.χ.:
- «OBS RENDERING lag → κλείσε Studio Mode / Disable Preview»
- «OBS ENCODING lag → βάλε hardware encoder»
- «Χαμηλός χώρος δίσκου», «Old GPU driver», «Weak WiFi», κ.λπ.

## Ασφάλεια

Το script είναι **read-only** διαγνωστικό: διαβάζει στοιχεία και γράφει **μόνο**
την αναφορά στην Επιφάνεια Εργασίας (και ένα προσωρινό αρχείο 128 MB για το τεστ
δίσκου, που σβήνεται αμέσως). Δεν αλλάζει καμία ρύθμιση.

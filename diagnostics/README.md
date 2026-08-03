# SaloniCup Diagnostic Kit 🩺 & OBS Optimizer ⚡

> **Δύο εργαλεία** εδώ: το **Diagnostic Kit** (μετράει) και ο **OBS Optimizer**
> (εφαρμόζει ασφαλείς βελτιστοποιήσεις). Ροή: τρέξε Optimizer → κάνε test
> stream → τρέξε Diagnostic → στείλε το report.

## ⚡ SaloniCup OBS Optimizer (Dell Latitude 7410 / Intel QuickSync)

Διπλό κλικ στο **`SaloniCup-OBS-Optimizer.bat`** (ζητά δικαιώματα admin,
**κλείσε πρώτα το OBS**). Εφαρμόζει **ΑΣΦΑΛΕΙΣ, αναστρέψιμες** αλλαγές:

- **Power:** High/Ultimate performance, USB selective suspend OFF, PCIe link OFF.
- **Windows:** Game DVR / background game capture OFF (τρώει CPU/GPU).
- **GPU preference:** OBS + browser → high-performance GPU.
- **OBS profiles:** φτιάχνει έτοιμα profile **«SaloniCup 1080p30»** και
  **«SaloniCup 720p60»** με **Intel QuickSync** encoder — τα διαλέγεις από το
  μενού Profile στο OBS (δεν πειράζει τα δικά σου).

Φτιάχνει φάκελο **Backup** στην Επιφάνεια Εργασίας με **`SaloniCup-RESTORE.bat`**
που τα επαναφέρει όλα. Δεν διαγράφει τίποτα.

Μετά: OBS → Profile → «SaloniCup 1080p30» → κλείσε Studio Mode → βάλε κάμερα +
Browser Source (overlay). Αν δυσκολεύεται στα 30fps, δοκίμασε το «720p60».

---

## SaloniCup Diagnostic Kit

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

// The 13 dashboard sections. `phase` = when the section's backend is built. Sections whose phase
// is not done show what they will do instead of placeholder numbers.
export interface Section { slug: string; label: string; icon: string; phase: number; active: boolean; about: string; needs?: string }

export const SECTIONS: Section[] = [
  { slug: "", label: "Overview", icon: "◎", phase: 1, active: true, about: "Κατάσταση συστήματος, εκκρεμότητες, τελευταίες ενέργειες του agent." },
  { slug: "chat", label: "AI Agent Chat", icon: "✦", phase: 1, active: true, about: "Φυσικές εντολές στον agent." },
  { slug: "studio", label: "Creative Studio", icon: "◧", phase: 2, active: false,
    about: "Γραφικά από brand templates (posts, stories, carousels, matchday, final score, thumbnails), AI εικόνες, αφαίρεση φόντου, resize, video (Reels/Shorts/TikTok) με υπότιτλους.",
    needs: "Phase 2: template renderer (next/og), πάροχος AI εικόνων, FFmpeg worker για video." },
  { slug: "calendar", label: "Content Calendar", icon: "▦", phase: 1, active: true, about: "Όλο το περιεχόμενο ανά ημέρα και κατάσταση." },
  { slug: "publishing", label: "Publishing Manager", icon: "➤", phase: 3, active: false,
    about: "Ουρά δημοσιεύσεων ανά πλατφόρμα, αποτυχίες, ασφαλείς επαναλήψεις, ειδοποιήσεις κατάστασης.",
    needs: "Phase 3: OAuth λογαριασμών και publishing workers ανά πλατφόρμα." },
  { slug: "accounts", label: "Social Accounts", icon: "⚭", phase: 3, active: true, about: "Συνδεδεμένοι λογαριασμοί και τι επιτρέπει κάθε API." },
  { slug: "analytics", label: "Analytics", icon: "▲", phase: 4, active: false,
    about: "Reach, views, engagement rate, watch time, saves, shares, profile visits, CTR, demographics — μόνο όσα δίνει κάθε API.",
    needs: "Phase 4: συνδεδεμένοι λογαριασμοί + καθημερινή συλλογή insights." },
  { slug: "reports", label: "Performance Reports", icon: "▤", phase: 4, active: false,
    about: "Ημερήσιες/εβδομαδιαίες/μηνιαίες αναφορές, top/worst posts, συγκρίσεις περιόδων και πλατφορμών, με τεκμηρίωση από δεδομένα.",
    needs: "Phase 4: ιστορικά analytics." },
  { slug: "competitors", label: "Competitor Analysis", icon: "⌖", phase: 6, active: false,
    about: "Δημόσια δεδομένα ανταγωνιστών: συχνότητα, θεματολογία, formats, engagement, δημοφιλή posts, ευκαιρίες διαφοροποίησης.",
    needs: "Phase 6. Ήδη τώρα: ζήτα από τον agent έρευνα ανταγωνιστών μέσω web search." },
  { slug: "community", label: "Community Manager", icon: "☍", phase: 6, active: false,
    about: "Νέα σχόλια και μηνύματα, κατηγοριοποίηση, αρνητικά σχόλια, προτεινόμενες απαντήσεις, εμπορικές ευκαιρίες, εγκρίσεις.",
    needs: "Phase 6: πρόσβαση σε comments/messages από συνδεδεμένους λογαριασμούς." },
  { slug: "strategy", label: "Marketing Strategy", icon: "◈", phase: 1, active: true, about: "Καμπάνιες, στρατηγική και ό,τι έχει μάθει ο agent." },
  { slug: "assets", label: "Asset Library", icon: "▣", phase: 2, active: false,
    about: "Λογότυπα, φωτογραφίες, βίντεο, fonts, templates και προηγούμενα δημιουργικά, οργανωμένα με tags.",
    needs: "Phase 2: uploads στο ιδιωτικό bucket «assets» και επεξεργασία εικόνας." },
  { slug: "settings", label: "Business Settings", icon: "⚙", phase: 1, active: true, about: "Brand identity, autonomy, emergency stop, αυτόματες εργασίες." },
];

export const EXTRA = [
  { slug: "approvals", label: "Εγκρίσεις", icon: "✓" },
  { slug: "activity", label: "Activity log", icon: "≡" },
  { slug: "status", label: "Κατάσταση APIs", icon: "⚡" },
];

/**
 * Layout για ΟΛΑ τα overlay (/overlay/*) — scoreboard & κλήρωση.
 * Κάνει το φόντο html/body ΔΙΑΦΑΝΟ (το globals.css βάζει μαύρο), ώστε στο OBS
 * να περνάει από πίσω η κάμερα. Ισχύει μόνο όσο είσαι σε overlay route.
 */
export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html,body{background:transparent !important}`}</style>
      {children}
    </>
  )
}

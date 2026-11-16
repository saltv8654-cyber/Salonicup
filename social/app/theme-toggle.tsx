"use client";
export function ThemeToggle() {
  return (
    <button
      type="button"
      className="btn-ghost px-3 py-1.5 text-xs"
      aria-label="Εναλλαγή θέματος"
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
      }}
    >◐ Θέμα</button>
  );
}

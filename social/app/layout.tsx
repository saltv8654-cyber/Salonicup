import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Social Agent", description: "Autonomous AI Social Media Manager" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applies the saved/OS theme before paint (no flash).
const themeScript = `try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}

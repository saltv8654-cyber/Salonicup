import "@fontsource/m-plus-rounded-1c/400.css";
import "@fontsource/m-plus-rounded-1c/500.css";
import "@fontsource/m-plus-rounded-1c/700.css";
import "@fontsource/m-plus-rounded-1c/800.css";
import "./globals.css";
import { ConsentedAnalytics, CookieBanner } from "./consent";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Billi",
  description: "Ανέβασε τον λογαριασμό σου και δες ποιο τιμολόγιο σε συμφέρει",
};

export const viewport: Viewport = { themeColor: "#01030f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body className="min-h-screen antialiased">
        {children}
        <CookieBanner />
        <ConsentedAnalytics />
      </body>
    </html>
  );
}

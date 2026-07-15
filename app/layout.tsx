import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'Salonicup',
  description: 'Ερασιτεχνικό πρωτάθλημα ποδοσφαίρου — Θεσσαλονίκη',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Salonicup' },
}

export const viewport: Viewport = {
  themeColor: '#0B0B0E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#16161B',
              color: '#EDEDF0',
              border: '1px solid rgba(237,237,240,0.08)',
              fontSize: 13,
              fontWeight: 600,
            },
          }}
        />
      </body>
    </html>
  )
}

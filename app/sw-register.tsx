'use client'
import { useEffect } from 'react'

/** Καταχωρεί τον service worker (μόνο σε production/https). */
export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}

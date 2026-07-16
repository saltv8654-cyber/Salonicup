/** @type {import('next').NextConfig} */
// build marker: 2026-07-17 — force fresh production deployment
module.exports = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
}

/** @type {import('next').NextConfig} */
// build marker: 2026-07-17b — redeploy to pick up push env vars
module.exports = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
}

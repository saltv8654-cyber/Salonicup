/** @type {import('next').NextConfig} */
// build marker: 2026-07-17c — redeploy for ANTHROPIC key
module.exports = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
}

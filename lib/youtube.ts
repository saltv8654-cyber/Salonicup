/** Βρίσκει το video id από διάφορες μορφές YouTube URL. */
export function ytId(url?: string | null): string | null {
  if (!url) return null
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ]
  for (const p of patterns) { const m = url.match(p); if (m) return m[1] }
  return null
}

/** Embed URL για ενσωμάτωση player, ή null αν δεν αναγνωρίζεται. */
export function ytEmbed(url?: string | null): string | null {
  const id = ytId(url)
  return id ? `https://www.youtube.com/embed/${id}?rel=0` : null
}

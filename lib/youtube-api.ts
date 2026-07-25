/**
 * Server-only helpers για το YouTube Live Streaming API.
 * ΠΟΤΕ να μην εισαχθεί σε client component — χρησιμοποιεί μυστικά (client secret,
 * refresh tokens). Όλες οι κλήσεις γίνονται από API routes.
 */

export const YT_SCOPES = ['https://www.googleapis.com/auth/youtube'].join(' ')

const OAUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/youtube/v3'

export function ytConfigured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET)
}

/** Το redirect URI που πρέπει να είναι δηλωμένο και στο Google Cloud. */
export function ytRedirectUri(origin: string) {
  return process.env.YOUTUBE_REDIRECT_URI || `${origin}/api/youtube/callback`
}

/** URL συναίνεσης Google — ο κάτοχος του καναλιού δίνει άδεια μία φορά. */
export function ytConsentUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: ytRedirectUri(origin),
    response_type: 'code',
    scope: YT_SCOPES,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent', // πάντα refresh token
    state,
  })
  return `${OAUTH}?${p.toString()}`
}

/** Ανταλλαγή κωδικού → tokens (access + refresh) μετά τη συναίνεση. */
export async function ytExchangeCode(origin: string, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    redirect_uri: ytRedirectUri(origin),
    grant_type: 'authorization_code',
  })
  const r = await fetch(TOKEN, { method: 'POST', body })
  if (!r.ok) throw new Error(`token exchange failed: ${await r.text()}`)
  return r.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}

/** Νέο access token από αποθηκευμένο refresh token. */
export async function ytAccessToken(refresh_token: string) {
  const body = new URLSearchParams({
    refresh_token,
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
  const r = await fetch(TOKEN, { method: 'POST', body })
  if (!r.ok) throw new Error(`refresh failed: ${await r.text()}`)
  const j = await r.json()
  return j.access_token as string
}

async function ytFetch(token: string, path: string, init?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error?.message || `YouTube API ${r.status}`)
  return j
}

/** Στοιχεία του συνδεδεμένου καναλιού (τίτλος + id). */
export async function ytMyChannel(token: string) {
  const j = await ytFetch(token, '/channels?part=snippet&mine=true')
  const c = j.items?.[0]
  return { channelId: c?.id as string | undefined, title: c?.snippet?.title as string | undefined }
}

/** Επαναχρησιμοποιήσιμο stream (σταθερό κλειδί RTMP για το OBS). */
export async function ytCreateReusableStream(token: string, title: string) {
  const j = await ytFetch(token, '/liveStreams?part=snippet,cdn,contentDetails', {
    method: 'POST',
    body: JSON.stringify({
      snippet: { title },
      cdn: { frameRate: 'variable', ingestionType: 'rtmp', resolution: 'variable' },
      contentDetails: { isReusable: true },
    }),
  })
  return {
    streamId: j.id as string,
    ingestUrl: j.cdn?.ingestionInfo?.ingestionAddress as string,
    streamKey: j.cdn?.ingestionInfo?.streamName as string,
  }
}

/** Δημιουργεί μετάδοση, τη δένει με το stream, επιστρέφει το video id. */
export async function ytCreateBroadcast(
  token: string, streamId: string,
  opts: { title: string; description?: string; privacy: 'public' | 'unlisted' | 'private' },
) {
  const b = await ytFetch(token, '/liveBroadcasts?part=snippet,status,contentDetails', {
    method: 'POST',
    body: JSON.stringify({
      snippet: { title: opts.title, description: opts.description || '', scheduledStartTime: new Date().toISOString() },
      status: { privacyStatus: opts.privacy, selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: true, enableAutoStop: true },
    }),
  })
  const broadcastId = b.id as string
  await ytFetch(token, `/liveBroadcasts/bind?id=${broadcastId}&streamId=${streamId}&part=id,contentDetails`, {
    method: 'POST',
  })
  return broadcastId
}

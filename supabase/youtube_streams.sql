-- ========================================================================
-- Salonicup · YouTube live streaming — τρέξε το ΜΙΑ φορά στο Supabase SQL editor
-- ========================================================================

-- Συνδεδεμένα κανάλια YouTube (κρατά refresh token + σταθερό stream key για OBS).
create table if not exists public.youtube_channels (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  channel_id    text,
  refresh_token text not null,
  stream_id     text,
  stream_key    text,
  ingest_url    text,
  created_at    timestamptz not null default now()
);

-- ΚΛΕΙΔΩΜΕΝΟ: κανένας client δεν διαβάζει tokens/keys.
-- Μόνο ο server (service role) το χειρίζεται μέσω των API routes.
alter table public.youtube_channels enable row level security;
-- (δεν ορίζουμε policies → default deny για anon & authenticated)

-- Σύνδεση αγώνα με τη μετάδοση που δημιουργήθηκε.
alter table public.matches add column if not exists yt_broadcast_id text;
alter table public.matches add column if not exists yt_channel_id  uuid;

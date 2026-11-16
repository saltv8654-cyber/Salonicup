-- ============================================================================
-- Salonicup Social Agent — τρέχει στην ΙΔΙΑ βάση με το Salonicup.
-- Όλοι οι πίνακες έχουν πρόθεμα social_ και δεν αγγίζουν τους υπάρχοντες.
-- Πρόσβαση: μόνο admins του Salonicup (profiles.role = 'admin', is_admin()).
-- Ασφαλές να ξανατρέξει (IF NOT EXISTS / OR REPLACE). Δεν σβήνει τίποτα.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Ρυθμίσεις + brand identity (μία γραμμή)
-- ---------------------------------------------------------------------------
create table if not exists social_settings (
  id boolean primary key default true check (id),
  brand_name text not null default 'Salonicup',
  description text,
  website text,
  language text not null default 'el',
  timezone text not null default 'Europe/Athens',
  autonomy_mode text not null default 'manual' check (autonomy_mode in ('manual','semi','full')),
  paused boolean not null default false,               -- emergency stop
  paused_reason text,
  monthly_ai_budget_usd numeric(10,2) not null default 50,  -- όριο ασφαλείας κόστους
  voice text,
  tone text,
  target_audience text,
  objectives text,
  colors jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,
  do_list text[] not null default '{}',
  dont_list text[] not null default '{}',
  hashtags text[] not null default '{}',
  guidelines text,
  updated_at timestamptz not null default now()
);
insert into social_settings (id, description, website, target_audience, hashtags) values (
  true,
  'Ερασιτεχνικό πρωτάθλημα ποδοσφαίρου στη Θεσσαλονίκη, με ζωντανή κάλυψη αγώνων, livestream στο YouTube (SALTV), βαθμολογίες, στατιστικά και κείμενα αγώνων.',
  'https://salonicup.gr',
  'Παίκτες, ομάδες, φίλοι και οικογένειες των ομάδων, ερασιτέχνες ποδοσφαιριστές της Θεσσαλονίκης.',
  '{#salonicup}'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Μνήμη, λογαριασμοί, περιεχόμενο
-- ---------------------------------------------------------------------------
create table if not exists social_memories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fact','preference','learning','strategy','campaign','audience','performance')),
  content text not null check (length(content) between 1 and 4000),
  importance smallint not null default 3 check (importance between 1 and 5),
  source text not null default 'agent' check (source in ('user','agent','analytics','system')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists social_memories_idx on social_memories(archived, importance desc, created_at desc);

create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube','linkedin')),
  external_id text not null,
  handle text,
  display_name text,
  status text not null default 'connected' check (status in ('connected','expired','error','disconnected')),
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);

-- Κρυπτογραφημένα (AES-256-GCM) από την εφαρμογή. RLS χωρίς policies: μόνο ο server.
create table if not exists social_tokens (
  account_id uuid primary key references social_accounts(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  updated_at timestamptz not null default now()
);

create table if not exists social_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  objective text,
  starts_on date,
  ends_on date,
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  strategy text,
  created_by text not null default 'agent' check (created_by in ('agent','user')),
  created_at timestamptz not null default now()
);

create table if not exists social_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image','video','logo','font','template','document','audio')),
  storage_path text not null,
  mime text,
  width int, height int, duration_s numeric,
  tags text[] not null default '{}',
  source text not null default 'upload' check (source in ('upload','generated','imported')),
  match_id uuid,                                        -- σύνδεση με αγώνα του Salonicup
  created_at timestamptz not null default now()
);

create table if not exists social_content (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references social_campaigns(id) on delete set null,
  match_id uuid,                                        -- αγώνας στον οποίο αναφέρεται (αν υπάρχει)
  kind text not null check (kind in ('post','story','carousel','reel','short','video','article','thumbnail','ad')),
  title text not null,
  brief text,
  caption text,
  hashtags text[] not null default '{}',
  cta text,
  platforms text[] not null default '{}',
  variants jsonb not null default '{}'::jsonb,
  asset_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in
    ('idea','draft','pending_approval','approved','scheduled','publishing','published','failed','rejected','archived')),
  planned_for timestamptz,
  scheduled_for timestamptz,
  published_at timestamptz,
  external_ids jsonb not null default '{}'::jsonb,
  last_error text,
  created_by text not null default 'agent' check (created_by in ('agent','user')),
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_content_planned_idx on social_content(planned_for);
create index if not exists social_content_status_idx on social_content(status);

-- ---------------------------------------------------------------------------
-- Εγκρίσεις, συζητήσεις, εκτελέσεις agent
-- ---------------------------------------------------------------------------
create table if not exists social_approvals (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_type text,
  target_id uuid,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  requested_by text not null default 'agent',
  run_id uuid,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists social_approvals_idx on social_approvals(status, created_at desc);

create table if not exists social_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Νέα συζήτηση',
  created_at timestamptz not null default now()
);

-- Τα content blocks του Claude API αυτούσια, μόνο προσθήκες, ξαναστέλνονται αμετάβλητα.
create table if not exists social_messages (
  id bigserial primary key,
  conversation_id uuid not null references social_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists social_messages_conv_idx on social_messages(conversation_id, id);

create table if not exists social_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references social_conversations(id) on delete set null,
  trigger text not null check (trigger in ('chat','schedule','job')),
  workflow text,
  status text not null default 'running' check (status in ('running','succeeded','failed','stopped','refused')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  web_searches int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  summary text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists social_runs_idx on social_runs(started_at desc);

create table if not exists social_steps (
  id bigserial primary key,
  run_id uuid not null references social_runs(id) on delete cascade,
  agent text not null default 'orchestrator',
  tool text not null,
  input jsonb,
  output jsonb,
  is_error boolean not null default false,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists social_steps_run_idx on social_steps(run_id, id);

-- ---------------------------------------------------------------------------
-- Background: ουρά εργασιών + προγραμματισμένες εργασίες
-- ---------------------------------------------------------------------------
create table if not exists social_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead','cancelled')),
  priority smallint not null default 5,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  idempotency_key text unique,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_jobs_ready_idx on social_jobs(status, run_at, priority);

create table if not exists social_schedules (
  workflow text primary key check (workflow in ('daily_check','weekly_strategy','monthly_report')),
  enabled boolean not null default false,
  hour_local smallint not null default 8 check (hour_local between 0 and 23),
  weekday smallint check (weekday between 0 and 6),     -- 0 = Κυριακή
  monthday smallint check (monthday between 1 and 28),
  next_run_at timestamptz,
  last_run_at timestamptz
);
insert into social_schedules (workflow, hour_local, weekday, monthday) values
  ('daily_check', 8, null, null), ('weekly_strategy', 9, 1, null), ('monthly_report', 10, null, 1)
on conflict (workflow) do nothing;

-- ---------------------------------------------------------------------------
-- Audit και κόστος
-- ---------------------------------------------------------------------------
create table if not exists social_activity (
  id bigserial primary key,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists social_activity_idx on social_activity(created_at desc);

create or replace function social_activity_append_only() returns trigger language plpgsql as $$
begin raise exception 'social_activity is append-only'; end $$;
drop trigger if exists social_activity_no_edit on social_activity;
create trigger social_activity_no_edit before update or delete on social_activity
  for each row execute function social_activity_append_only();

create table if not exists social_ai_usage (
  id bigserial primary key,
  run_id uuid,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  web_searches int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists social_ai_usage_idx on social_ai_usage(created_at);

-- ---------------------------------------------------------------------------
-- Συναρτήσεις
-- ---------------------------------------------------------------------------
-- Παίρνει ατομικά έτοιμες εργασίες· όσες κόλλησαν 15' σε running ξαναμπαίνουν στην ουρά.
create or replace function social_claim_jobs(p_worker text, p_limit int default 5)
returns setof social_jobs language plpgsql as $$
begin
  update social_jobs set status = 'queued', locked_at = null, locked_by = null,
         last_error = coalesce(last_error, '') || ' [released after lock timeout]', updated_at = now()
   where status = 'running' and locked_at < now() - interval '15 minutes';
  return query
  update social_jobs j set status = 'running', locked_at = now(), locked_by = p_worker,
         attempts = j.attempts + 1, updated_at = now()
   where j.id in (select id from social_jobs where status = 'queued' and run_at <= now()
                  order by priority, run_at limit p_limit for update skip locked)
  returning j.*;
end $$;
revoke all on function social_claim_jobs(text, int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function social_claim_jobs(text, int) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function social_claim_jobs(text, int) to service_role;
  end if;
end $$;

create or replace function social_month_cost() returns numeric language sql stable as $$
  select coalesce(sum(cost_usd), 0) from social_ai_usage where created_at >= date_trunc('month', now())
$$;

create or replace function social_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists social_content_touch on social_content;
create trigger social_content_touch before update on social_content for each row execute function social_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: μόνο admins του Salonicup. Ο agent/worker γράφει με το service role.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  -- admins διαβάζουν και γράφουν
  foreach t in array array['social_settings','social_memories','social_campaigns','social_assets','social_content','social_schedules'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %1$s_admin on %1$s', t);
    execute format('create policy %1$s_admin on %1$s for all using (is_admin()) with check (is_admin())', t);
  end loop;
  -- admins μόνο διαβάζουν (γράφει ο server)
  foreach t in array array['social_accounts','social_approvals','social_messages','social_runs','social_steps','social_jobs','social_activity','social_ai_usage'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (is_admin())', t);
  end loop;
end $$;

alter table social_conversations enable row level security;
drop policy if exists social_conversations_read on social_conversations;
create policy social_conversations_read on social_conversations for select using (is_admin());
drop policy if exists social_conversations_insert on social_conversations;
create policy social_conversations_insert on social_conversations for insert with check (is_admin() and user_id = auth.uid());

alter table social_tokens enable row level security;   -- χωρίς policies

-- Ιδιωτικό bucket για το Asset Library.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('social-assets', 'social-assets', false) on conflict (id) do nothing;
  end if;
end $$;

-- ============================================================================
-- Salonicup Social Agent — Phase 1 core schema
-- Multi-tenant: organization → businesses → everything else.
-- Every tenant table carries business_id and is protected by RLS.
-- Safe to re-run: objects are created with IF NOT EXISTS / OR REPLACE.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type member_role as enum ('owner','admin','editor','viewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type autonomy_mode as enum ('manual','semi','full');
exception when duplicate_object then null; end $$;
do $$ begin
  create type social_platform as enum ('instagram','facebook','tiktok','youtube','linkedin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type content_status as enum
    ('idea','draft','pending_approval','approved','scheduled','publishing','published','failed','rejected','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type approval_status as enum ('pending','approved','rejected','expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type job_status as enum ('queued','running','succeeded','failed','dead','cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- SaaS: plans, organizations, members
-- ---------------------------------------------------------------------------
create table if not exists plans (
  id text primary key,
  name text not null,
  monthly_price_eur numeric(10,2) not null default 0,
  max_businesses int not null,
  max_social_accounts int not null,
  monthly_ai_budget_usd numeric(10,2) not null,
  monthly_agent_runs int not null
);
insert into plans (id, name, monthly_price_eur, max_businesses, max_social_accounts, monthly_ai_budget_usd, monthly_agent_runs) values
  ('trial',  'Trial',   0,   1,  5,  10,   100),
  ('pro',    'Pro',     49,  1,  10, 40,   1000),
  ('agency', 'Agency',  199, 10, 60, 200,  8000)
on conflict (id) do nothing;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  plan_id text not null default 'trial' references plans(id),
  agent_enabled boolean not null default true,          -- global kill switch for the whole tenant
  billing_customer_id text,                             -- Phase 7 (Stripe)
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists organization_members_user_idx on organization_members(user_id);

-- ---------------------------------------------------------------------------
-- Businesses and their permanent memory
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  industry text,
  description text,
  website text,
  language text not null default 'el',
  timezone text not null default 'Europe/Athens',
  autonomy_mode autonomy_mode not null default 'manual',
  autonomy_paused boolean not null default false,       -- per-business emergency stop
  paused_reason text,
  created_at timestamptz not null default now()
);
create index if not exists businesses_org_idx on businesses(org_id);

create table if not exists brand_profiles (
  business_id uuid primary key references businesses(id) on delete cascade,
  voice text,
  tone text,
  target_audience text,
  objectives text,
  colors jsonb not null default '[]'::jsonb,            -- [{name, hex}]
  fonts jsonb not null default '[]'::jsonb,             -- [{role, family}]
  do_list text[] not null default '{}',
  dont_list text[] not null default '{}',
  hashtags text[] not null default '{}',
  guidelines text,
  updated_at timestamptz not null default now()
);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('fact','preference','learning','strategy','campaign','audience','performance')),
  content text not null check (length(content) between 1 and 4000),
  importance smallint not null default 3 check (importance between 1 and 5),
  source text not null default 'agent' check (source in ('user','agent','analytics','system')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists memories_business_idx on memories(business_id, archived, importance desc, created_at desc);

-- ---------------------------------------------------------------------------
-- Social accounts (tokens live in a separate, policy-less table)
-- ---------------------------------------------------------------------------
create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  platform social_platform not null,
  external_id text not null,
  handle text,
  display_name text,
  status text not null default 'connected' check (status in ('connected','expired','error','disconnected')),
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (business_id, platform, external_id)
);

-- Encrypted with AES-256-GCM in the app (TOKEN_ENCRYPTION_KEY). RLS on, no policies:
-- only the service role (server) can read it. Never exposed to the browser.
create table if not exists social_tokens (
  account_id uuid primary key references social_accounts(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  objective text,
  starts_on date,
  ends_on date,
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  strategy text,
  created_by text not null default 'agent' check (created_by in ('agent','user')),
  created_at timestamptz not null default now()
);
create index if not exists campaigns_business_idx on campaigns(business_id, starts_on);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('image','video','logo','font','template','document','audio')),
  storage_path text not null,
  mime text,
  width int, height int, duration_s numeric,
  tags text[] not null default '{}',
  source text not null default 'upload' check (source in ('upload','generated','imported')),
  created_at timestamptz not null default now()
);
create index if not exists assets_business_idx on assets(business_id, created_at desc);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  kind text not null check (kind in ('post','story','carousel','reel','short','video','article','thumbnail','ad')),
  title text not null,
  brief text,
  caption text,
  hashtags text[] not null default '{}',
  cta text,
  platforms social_platform[] not null default '{}',
  variants jsonb not null default '{}'::jsonb,          -- per-platform caption/format overrides
  asset_ids uuid[] not null default '{}',
  status content_status not null default 'draft',
  planned_for timestamptz,                              -- calendar placement (a plan)
  scheduled_for timestamptz,                            -- publishing commitment
  published_at timestamptz,
  external_ids jsonb not null default '{}'::jsonb,      -- {platform: remote id}
  last_error text,
  created_by text not null default 'agent' check (created_by in ('agent','user')),
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_items_business_idx on content_items(business_id, planned_for);
create index if not exists content_items_status_idx on content_items(business_id, status);

-- ---------------------------------------------------------------------------
-- Approvals, conversations, agent runs
-- ---------------------------------------------------------------------------
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  action text not null,                                 -- e.g. schedule_post, publish_post, reply_comment
  target_type text,
  target_id uuid,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status approval_status not null default 'pending',
  requested_by text not null default 'agent',
  run_id uuid,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists approvals_pending_idx on approvals(business_id, status, created_at desc);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Νέα συζήτηση',
  created_at timestamptz not null default now()
);
create index if not exists conversations_business_idx on conversations(business_id, created_at desc);

-- Raw Messages API content blocks, append-only, replayed unchanged on the next turn.
create table if not exists conversation_messages (
  id bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conv_idx on conversation_messages(conversation_id, id);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
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
create index if not exists agent_runs_business_idx on agent_runs(business_id, started_at desc);

create table if not exists agent_steps (
  id bigserial primary key,
  run_id uuid not null references agent_runs(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  agent text not null default 'orchestrator',
  tool text not null,
  input jsonb,
  output jsonb,
  is_error boolean not null default false,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists agent_steps_run_idx on agent_steps(run_id, id);

-- ---------------------------------------------------------------------------
-- Background runtime: job queue + workflow schedules
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status job_status not null default 'queued',
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
create index if not exists jobs_ready_idx on jobs(status, run_at, priority);

create table if not exists workflow_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  workflow text not null check (workflow in ('daily_check','weekly_strategy','monthly_report')),
  enabled boolean not null default true,
  hour_local smallint not null default 8 check (hour_local between 0 and 23),
  weekday smallint check (weekday between 0 and 6),      -- 0 = Sunday (weekly)
  monthday smallint check (monthday between 1 and 28),   -- monthly
  next_run_at timestamptz,
  last_run_at timestamptz,
  unique (business_id, workflow)
);

-- ---------------------------------------------------------------------------
-- Audit and usage
-- ---------------------------------------------------------------------------
create table if not exists activity_log (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_business_idx on activity_log(business_id, created_at desc);

create or replace function activity_log_append_only() returns trigger language plpgsql as $$
begin
  -- Cascading deletes from a removed tenant are allowed; edits are not.
  if tg_op = 'UPDATE' then
    raise exception 'activity_log is append-only';
  end if;
  if tg_op = 'DELETE' and exists (select 1 from organizations where id = old.org_id) then
    raise exception 'activity_log is append-only';
  end if;
  return old;
end $$;
drop trigger if exists activity_log_no_edit on activity_log;
create trigger activity_log_no_edit before update or delete on activity_log
  for each row execute function activity_log_append_only();

create table if not exists ai_usage (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
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
create index if not exists ai_usage_org_month_idx on ai_usage(org_id, created_at);

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function role_rank(r member_role) returns int language sql immutable as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 else 1 end
$$;

create or replace function has_org_role(p_org uuid, p_min member_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.org_id = p_org and m.user_id = auth.uid() and role_rank(m.role) >= role_rank(p_min)
  )
$$;

create or replace function can_access_business(p_business uuid, p_min member_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from businesses b
    join organization_members m on m.org_id = b.org_id
    where b.id = p_business and m.user_id = auth.uid() and role_rank(m.role) >= role_rank(p_min)
  )
$$;

-- Onboarding: creates an organization, makes the caller its owner and creates the first business.
create or replace function create_organization(p_org_name text, p_business_name text, p_industry text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_business uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name) values (p_org_name) returning id into v_org;
  insert into organization_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into businesses (org_id, name, industry) values (v_org, p_business_name, p_industry) returning id into v_business;
  insert into brand_profiles (business_id) values (v_business);
  insert into workflow_schedules (business_id, workflow, hour_local, weekday, monthday, enabled) values
    (v_business, 'daily_check', 8, null, null, false),
    (v_business, 'weekly_strategy', 9, 1, null, false),
    (v_business, 'monthly_report', 10, null, 1, false);
  insert into activity_log (org_id, business_id, actor_type, actor_id, action, target_type, target_id)
    values (v_org, v_business, 'user', auth.uid()::text, 'organization.created', 'organization', v_org::text);
  return v_business;
end $$;

-- Additional businesses inside an existing organization (respects the plan limit).
create or replace function create_business(p_org uuid, p_name text, p_industry text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_business uuid; v_limit int; v_count int;
begin
  if not has_org_role(p_org, 'admin') then raise exception 'forbidden'; end if;
  select p.max_businesses into v_limit from organizations o join plans p on p.id = o.plan_id where o.id = p_org;
  select count(*) into v_count from businesses where org_id = p_org;
  if v_count >= v_limit then raise exception 'plan limit reached: % businesses', v_limit; end if;
  insert into businesses (org_id, name, industry) values (p_org, p_name, p_industry) returning id into v_business;
  insert into brand_profiles (business_id) values (v_business);
  insert into workflow_schedules (business_id, workflow, hour_local, weekday, monthday, enabled) values
    (v_business, 'daily_check', 8, null, null, false),
    (v_business, 'weekly_strategy', 9, 1, null, false),
    (v_business, 'monthly_report', 10, null, 1, false);
  insert into activity_log (org_id, business_id, actor_type, actor_id, action, target_type, target_id)
    values (p_org, v_business, 'user', auth.uid()::text, 'business.created', 'business', v_business::text);
  return v_business;
end $$;

-- Queue: atomically claims ready jobs. Jobs stuck in 'running' for 15 minutes are released first
-- (the worker that held them died). Called only by the server with the service role.
create or replace function claim_jobs(p_worker text, p_limit int default 5)
returns setof jobs language plpgsql as $$
begin
  update jobs set status = 'queued', locked_at = null, locked_by = null,
                  last_error = coalesce(last_error, '') || ' [released after lock timeout]', updated_at = now()
   where status = 'running' and locked_at < now() - interval '15 minutes';

  return query
  update jobs j set status = 'running', locked_at = now(), locked_by = p_worker,
                    attempts = j.attempts + 1, updated_at = now()
   where j.id in (
     select id from jobs
      where status = 'queued' and run_at <= now()
      order by priority, run_at
      limit p_limit
      for update skip locked)
  returning j.*;
end $$;
revoke all on function claim_jobs(text, int) from public;
do $$ begin
  -- Supabase grants EXECUTE on new functions to anon/authenticated by default; take it back.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function claim_jobs(text, int) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function claim_jobs(text, int) to service_role;
  end if;
end $$;

create or replace function org_month_usage(p_org uuid)
returns table (cost_usd numeric, runs bigint) language sql stable security definer set search_path = public as $$
  select coalesce((select sum(u.cost_usd) from ai_usage u
                    where u.org_id = p_org and u.created_at >= date_trunc('month', now())), 0),
         (select count(*) from agent_runs r join businesses b on b.id = r.business_id
           where b.org_id = p_org and r.started_at >= date_trunc('month', now()))
  where auth.uid() is null or has_org_role(p_org, 'viewer')   -- server (no user) or a member
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists content_items_touch on content_items;
create trigger content_items_touch before update on content_items for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table plans enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table businesses enable row level security;
alter table brand_profiles enable row level security;
alter table memories enable row level security;
alter table social_accounts enable row level security;
alter table social_tokens enable row level security;
alter table campaigns enable row level security;
alter table assets enable row level security;
alter table content_items enable row level security;
alter table approvals enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table agent_runs enable row level security;
alter table agent_steps enable row level security;
alter table jobs enable row level security;
alter table workflow_schedules enable row level security;
alter table activity_log enable row level security;
alter table ai_usage enable row level security;

drop policy if exists plans_read on plans;
create policy plans_read on plans for select to authenticated using (true);

drop policy if exists org_read on organizations;
create policy org_read on organizations for select using (has_org_role(id, 'viewer'));
drop policy if exists org_update on organizations;
create policy org_update on organizations for update using (has_org_role(id, 'admin')) with check (has_org_role(id, 'admin'));

drop policy if exists members_read on organization_members;
create policy members_read on organization_members for select using (has_org_role(org_id, 'viewer'));
drop policy if exists members_manage on organization_members;
create policy members_manage on organization_members for all
  using (has_org_role(org_id, 'admin')) with check (has_org_role(org_id, 'admin') and role <> 'owner');

drop policy if exists businesses_read on businesses;
create policy businesses_read on businesses for select using (has_org_role(org_id, 'viewer'));
drop policy if exists businesses_update on businesses;
create policy businesses_update on businesses for update using (has_org_role(org_id, 'admin')) with check (has_org_role(org_id, 'admin'));

-- Standard tenant tables: viewers read, editors write, admins delete.
do $$
declare t text;
begin
  foreach t in array array['brand_profiles','memories','campaigns','assets','content_items','workflow_schedules'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (can_access_business(business_id, ''viewer''))', t);
    execute format('drop policy if exists %1$s_insert on %1$s', t);
    execute format('create policy %1$s_insert on %1$s for insert with check (can_access_business(business_id, ''editor''))', t);
    execute format('drop policy if exists %1$s_update on %1$s', t);
    execute format('create policy %1$s_update on %1$s for update using (can_access_business(business_id, ''editor'')) with check (can_access_business(business_id, ''editor''))', t);
    execute format('drop policy if exists %1$s_delete on %1$s', t);
    execute format('create policy %1$s_delete on %1$s for delete using (can_access_business(business_id, ''admin''))', t);
  end loop;
  -- Read-only for members; written only by the server (service role), which bypasses RLS.
  foreach t in array array['social_accounts','approvals','agent_runs','agent_steps','jobs','activity_log','conversation_messages'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (can_access_business(business_id, ''viewer''))', t);
  end loop;
end $$;

drop policy if exists conversations_read on conversations;
create policy conversations_read on conversations for select using (can_access_business(business_id, 'viewer'));
drop policy if exists conversations_insert on conversations;
create policy conversations_insert on conversations for insert
  with check (can_access_business(business_id, 'editor') and user_id = auth.uid());

drop policy if exists ai_usage_read on ai_usage;
create policy ai_usage_read on ai_usage for select using (has_org_role(org_id, 'admin'));
-- social_tokens: intentionally no policies.

-- Private bucket for the Creative Asset Library (paths: <business_id>/...).
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('assets', 'assets', false) on conflict (id) do nothing;
  end if;
end $$;

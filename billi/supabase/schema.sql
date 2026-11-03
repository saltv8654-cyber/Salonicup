-- billi: leads, contact history and funnel events.
-- Run once in the Supabase SQL editor of the billi project.
-- RLS is on with no policies: only the server (service role key) can read or write.

create extension if not exists pgcrypto;

create table if not exists leads (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  name                text not null,
  phone               text not null,
  email               text,
  preferred_time      text,
  message             text,
  consent_contact     boolean not null,
  consent_marketing   boolean not null default false,
  status              text not null default 'new'
                      check (status in ('new', 'contacted', 'offer', 'signed', 'active', 'lost')),
  tariff_id           text,
  tariff_label        text,
  current_provider    text,
  current_program     text,
  annual_kwh          integer,
  current_annual      numeric(10, 2),
  offer_annual        numeric(10, 2),
  savings             numeric(10, 2),
  bill                jsonb,
  source              jsonb,
  session_id          text,
  signed_provider     text,
  expected_commission numeric(10, 2),
  next_follow_up      date
);
create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_status_idx on leads (status);

create table if not exists lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  created_at timestamptz not null default now(),
  type       text not null check (type in ('note', 'call', 'email', 'status', 'system')),
  body       text not null
);
create index if not exists lead_activities_lead_idx on lead_activities (lead_id, created_at desc);

create table if not exists events (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  session_id text,
  name       text not null,
  path       text,
  props      jsonb,
  source     jsonb
);
create index if not exists events_created_at_idx on events (created_at desc);
create index if not exists events_name_idx on events (name, created_at desc);

alter table leads enable row level security;
alter table lead_activities enable row level security;
alter table events enable row level security;

-- Tariff catalogue, edited from /admin → Τιμές. When empty, the site uses data/tariffs.json.
create table if not exists tariffs (
  id                              text primary key,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  provider                        text not null,
  name                            text not null,
  color                           text not null check (color in ('blue', 'green', 'yellow', 'orange')),
  fixed_monthly_eur               numeric(8, 2) not null,
  price_per_kwh_eur               numeric(8, 5) not null,
  price_per_kwh_with_discount_eur numeric(8, 5),
  discount_condition              text,
  min_duration_months             integer,
  valid_month                     text not null,
  url                             text,
  active                          boolean not null default true
);
create index if not exists tariffs_provider_idx on tariffs (provider);
alter table tariffs enable row level security;

-- billi 2.0: user accounts, energy profiles, bill history, alerts, service categories and CRM updates.
-- Run after 20261104_energy_data.sql. Safe to run more than once.
-- Accounts use Supabase Auth (auth.users). The server reads and writes these tables with the service
-- role key after checking the signed-in user; the policies below also let a user reach only their own rows.

create extension if not exists pgcrypto;

-- 1. Utility categories: new services are rows, not new code paths.
create table if not exists service_categories (
  id       text primary key,
  label_el text not null,
  label_en text not null,
  active   boolean not null default false,
  sort     integer not null default 0
);
insert into service_categories (id, label_el, label_en, active, sort) values
  ('electricity', 'Ρεύμα', 'Electricity', true, 1),
  ('gas', 'Φυσικό αέριο', 'Natural gas', false, 2),
  ('internet', 'Internet', 'Internet', false, 3),
  ('mobile', 'Κινητή', 'Mobile', false, 4)
on conflict (id) do nothing;

-- 2. Account settings
create table if not exists user_profiles (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  display_name           text,
  locale                 text not null default 'el' check (locale in ('el', 'en')),
  inapp_alerts           boolean not null default true,
  email_alerts           boolean not null default false,
  email_verified_at      timestamptz,
  min_savings_eur        numeric(8, 2) not null default 30 check (min_savings_eur >= 0),
  contract_reminder_days integer not null default 30 check (contract_reminder_days between 1 and 180),
  alerts_checked_at      timestamptz
);

-- 3. One energy profile per user and category
create table if not exists energy_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  category              text not null default 'electricity' references service_categories (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  provider              text,
  provider_id           uuid references energy_providers (id) on delete set null,
  tariff_id             text,      -- published programme, if matched; no FK so history survives deletions
  program_name          text,
  color                 text check (color in ('blue', 'green', 'yellow', 'orange')),
  monthly_kwh           numeric(10, 2) check (monthly_kwh >= 0),
  day_kwh               numeric(10, 2) check (day_kwh >= 0),
  night_kwh             numeric(10, 2) check (night_kwh >= 0),
  price_per_kwh         numeric(8, 5) check (price_per_kwh >= 0),
  price_per_kwh_night   numeric(8, 5) check (price_per_kwh_night >= 0),
  fixed_monthly_fee     numeric(8, 2) check (fixed_monthly_fee >= 0),
  contract_start        date,
  contract_end          date,
  early_termination_fee text,
  unique (user_id, category),
  check (contract_end is null or contract_start is null or contract_end >= contract_start)
);
create index if not exists energy_profiles_tariff_idx on energy_profiles (tariff_id);

-- 4. Bills the user chose to keep: the numbers only, never the file
create table if not exists user_bills (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  profile_id      uuid references energy_profiles (id) on delete set null,
  category        text not null default 'electricity' references service_categories (id),
  created_at      timestamptz not null default now(),
  provider        text,
  program_name    text,
  color           text,
  period_start    date,
  period_end      date,
  billing_days    integer,
  kwh_total       numeric(10, 2),
  kwh_day         numeric(10, 2),
  kwh_night       numeric(10, 2),
  supply_total    numeric(10, 2),
  regulated_total numeric(10, 2),
  taxes_total     numeric(10, 2),
  total_due       numeric(10, 2),
  data            jsonb not null default '{}'
);
create index if not exists user_bills_user_idx on user_bills (user_id, period_end desc);

-- 5. Notifications (in-app; e-mailed when the user opted in and verified the address)
create table if not exists user_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('cheaper_program', 'provider_increase', 'provider_better_offer', 'contract_expiring', 'overpaying')),
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}',
  dedupe_key text not null,
  read_at    timestamptz,
  emailed_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists user_alerts_user_idx on user_alerts (user_id, created_at desc);

-- 6. Row Level Security: each user only their own rows
alter table service_categories enable row level security;
alter table user_profiles      enable row level security;
alter table energy_profiles    enable row level security;
alter table user_bills         enable row level security;
alter table user_alerts        enable row level security;

drop policy if exists "anyone reads categories" on service_categories;
create policy "anyone reads categories" on service_categories for select to anon, authenticated using (true);
drop policy if exists "own profile" on user_profiles;
create policy "own profile" on user_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own energy profiles" on energy_profiles;
create policy "own energy profiles" on energy_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own bills" on user_bills;
create policy "own bills" on user_bills for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own alerts" on user_alerts;
create policy "own alerts" on user_alerts for select to authenticated using (user_id = auth.uid());

-- 7. CRM: requested service, link to the account, and the "under evaluation" stage
alter table leads add column if not exists requested_service text;
alter table leads add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'evaluation', 'offer', 'signed', 'active', 'lost'));
create index if not exists leads_user_idx on leads (user_id);
alter table user_alerts drop constraint if exists user_alerts_kind_check;
alter table user_alerts add constraint user_alerts_kind_check check (kind in (
  'cheaper_program', 'provider_increase', 'provider_better_offer', 'contract_expiring', 'overpaying', 'monthly_summary'));

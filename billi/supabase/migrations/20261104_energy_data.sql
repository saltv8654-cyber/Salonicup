-- billi: Energy Data Management (electricity tariffs).
-- Providers, the sources Billi checks, the approval queue, price history and audit logs.
-- Safe to run more than once. Run it in Supabase → SQL Editor after schema.sql.
--
-- The published catalogue stays in the existing `tariffs` table (the site and the CRM already read it);
-- this migration extends it with the extra tariff fields instead of creating a second copy.
-- `energy_tariffs` is a read-only view of its electricity rows.

create extension if not exists pgcrypto;

-- 0. Earlier upgrades, repeated so this file works on any billi database.
alter table tariffs add column if not exists category text not null default 'electricity';
do $$ begin
  alter table tariffs add constraint tariffs_category_check check (category in ('electricity', 'gas'));
exception when duplicate_object then null; end $$;

-- 1. Providers
create table if not exists energy_providers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slug       text not null unique,
  name       text not null unique,
  aliases    text[] not null default '{}',
  website    text,
  active     boolean not null default true,
  notes      text
);

insert into energy_providers (slug, name, aliases, website) values
  ('dei',        'ΔΕΗ',        array['ΔΕΗ', 'PPC', 'Δημόσια Επιχείρηση Ηλεκτρισμού'], 'https://www.dei.gr'),
  ('protergia',  'Protergia',  array['Protergia', 'Protergia Power'],                 'https://www.protergia.gr'),
  ('heron',      'ΗΡΩΝ',       array['ΗΡΩΝ', 'Ήρων', 'Heron'],                        'https://www.heron.gr'),
  ('nrg',        'nrg',        array['nrg', 'NRG', 'nrg supply and trading'],          'https://www.nrg.gr'),
  ('zenith',     'ZeniΘ',      array['ZeniΘ', 'Zenith', 'Ζενίθ'],                      'https://zenith.gr'),
  ('elpedison',  'Elpedison',  array['Elpedison', 'Ελπέδισον'],                        'https://www.elpedison.gr'),
  ('volton',     'Volton',     array['Volton'],                                        'https://www.volton.gr'),
  ('eunice',     'EUNICE',     array['EUNICE', 'Eunice'],                              'https://www.eunice.gr'),
  ('elin',       'ΕΛΙΝ',       array['ΕΛΙΝ', 'ELIN', 'Power On', 'ΕΛΙΝ Βερντ'],        'https://energy.elin.gr'),
  ('fysikoaerio','Φυσικό Αέριο Ελληνική Εταιρεία Ενέργειας',
                 array['Φυσικό Αέριο', 'Φυσικό Αέριο Ελλάδος', 'Fysiko Aerio'],      'https://fysikoaerioellados.gr'),
  ('watt-volt',  'Watt+Volt',  array['Watt+Volt', 'Watt & Volt', 'WATT+VOLT'],         'https://www.watt-volt.gr')
on conflict (slug) do nothing;

-- Providers already used in the catalogue but missing above.
insert into energy_providers (slug, name, aliases)
select distinct lower(regexp_replace(t.provider, '[^[:alnum:]]+', '-', 'g')), t.provider, array[t.provider]
from tariffs t
where not exists (select 1 from energy_providers p where p.name = t.provider or t.provider = any (p.aliases))
on conflict do nothing;

-- 2. Where Billi reads prices from
create table if not exists tariff_data_sources (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  provider_id        uuid references energy_providers (id) on delete cascade, -- null: lists many providers (ΡΑΑΕΥ)
  label              text not null,
  url                text not null unique,
  kind               text not null default 'auto' check (kind in ('auto', 'html', 'pdf')),
  segment            text not null default 'residential' check (segment in ('residential', 'business', 'both')),
  enabled            boolean not null default true,
  check_every_hours  integer not null default 24 check (check_every_hours between 1 and 720),
  last_checked_at    timestamptz,
  last_success_at    timestamptz,
  last_status        text check (last_status in ('ok', 'unchanged', 'failed')),
  last_error         text,
  last_hash          text,
  last_document_path text,
  notes              text
);
create index if not exists tariff_data_sources_due_idx on tariff_data_sources (enabled, last_checked_at);

insert into tariff_data_sources (provider_id, label, url, kind) values
  ((select id from energy_providers where slug = 'dei'),        'ΔΕΗ · Γ1/Γ1Ν Οικιακό',                 'https://www.dei.gr/en/home/electricity/g1-g1n/', 'html'),
  ((select id from energy_providers where slug = 'protergia'),  'Protergia · Χρεώσεις οικιακών τιμολογίων', 'https://www.protergia.gr/el/pricesres/',               'html'),
  ((select id from energy_providers where slug = 'zenith'),     'ZeniΘ · Power Home Save',              'https://zenith.gr/el/for-the-home/electricity/power-home-save/', 'html'),
  ((select id from energy_providers where slug = 'zenith'),     'ZeniΘ · Power Home Flex',              'https://zenith.gr/el/for-the-home/electricity/power-home-flex/', 'html'),
  ((select id from energy_providers where slug = 'fysikoaerio'),'Φυσικό Αέριο ΕΕΕ · Οικιακά ρεύμα',    'https://fysikoaerioellados.gr/el/home/revma',          'html'),
  (null,                                                         'ΡΑΑΕΥ · Τιμολόγια προμηθευτών',        'https://invoices.rae.gr/',                             'html')
on conflict (url) do nothing;

-- 3. The published catalogue (= energy_tariffs): extra fields
alter table tariffs add column if not exists provider_id             uuid references energy_providers (id) on delete set null;
alter table tariffs add column if not exists source_id               uuid references tariff_data_sources (id) on delete set null;
alter table tariffs add column if not exists segment                 text not null default 'residential';
alter table tariffs add column if not exists day_night               boolean not null default false;
alter table tariffs add column if not exists price_per_kwh_night_eur numeric(8, 5);
alter table tariffs add column if not exists promo_discount          text;
alter table tariffs add column if not exists early_termination_fee   text;
alter table tariffs add column if not exists conditions              text;
alter table tariffs add column if not exists valid_from              date;
alter table tariffs add column if not exists valid_until             date;
alter table tariffs add column if not exists last_verified_at        timestamptz;
alter table tariffs add column if not exists data_status             text not null default 'unverified';
alter table tariffs add column if not exists updated_by              text;
do $$ begin
  alter table tariffs add constraint tariffs_segment_check check (segment in ('residential', 'business'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table tariffs add constraint tariffs_data_status_check check (data_status in ('verified', 'unverified'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table tariffs add constraint tariffs_validity_check check (valid_until is null or valid_from is null or valid_until >= valid_from);
exception when duplicate_object then null; end $$;
create index if not exists tariffs_provider_id_idx on tariffs (provider_id);
create index if not exists tariffs_source_id_idx on tariffs (source_id);

update tariffs t set provider_id = p.id
from energy_providers p
where t.provider_id is null and (p.name = t.provider or t.provider = any (p.aliases));

create or replace view energy_tariffs with (security_invoker = true) as
  select * from tariffs where category = 'electricity';

-- 4. Price history: one row per published change, never updated or deleted
create table if not exists tariff_price_history (
  id                              bigserial primary key,
  changed_at                      timestamptz not null default now(),
  tariff_id                       text not null,
  change                          text not null check (change in ('baseline', 'created', 'updated', 'deactivated', 'reactivated', 'deleted')),
  provider                        text not null,
  name                            text not null,
  color                           text,
  fixed_monthly_eur               numeric(8, 2),
  price_per_kwh_eur               numeric(8, 5),
  price_per_kwh_with_discount_eur numeric(8, 5),
  price_per_kwh_night_eur         numeric(8, 5),
  valid_month                     text,
  valid_from                      date,
  valid_until                     date,
  active                          boolean,
  snapshot                        jsonb not null,
  changed_by                      text,
  source_url                      text
);
create index if not exists tariff_price_history_tariff_idx on tariff_price_history (tariff_id, changed_at desc);

create or replace function billi_forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists tariff_price_history_append_only on tariff_price_history;
create trigger tariff_price_history_append_only before update or delete on tariff_price_history
  for each row execute function billi_forbid_change();

-- Every insert / price change / (de)activation / delete of a tariff is recorded by the database itself,
-- so no code path can skip it. `updated_by` on the tariff row names who made the change.
create or replace function billi_tariff_history() returns trigger language plpgsql as $$
declare
  r    tariffs;
  kind text;
begin
  if tg_op = 'DELETE' then
    r := old; kind := 'deleted';
  elsif tg_op = 'INSERT' then
    r := new; kind := 'created';
  else
    r := new;
    if old.active and not new.active then kind := 'deactivated';
    elsif not old.active and new.active then kind := 'reactivated';
    elsif (old.provider, old.name, old.color, old.fixed_monthly_eur, old.price_per_kwh_eur, old.price_per_kwh_with_discount_eur,
           old.price_per_kwh_night_eur, old.day_night, old.discount_condition, old.promo_discount, old.min_duration_months,
           old.early_termination_fee, old.conditions, old.valid_month, old.valid_from, old.valid_until, old.segment)
          is distinct from
          (new.provider, new.name, new.color, new.fixed_monthly_eur, new.price_per_kwh_eur, new.price_per_kwh_with_discount_eur,
           new.price_per_kwh_night_eur, new.day_night, new.discount_condition, new.promo_discount, new.min_duration_months,
           new.early_termination_fee, new.conditions, new.valid_month, new.valid_from, new.valid_until, new.segment)
      then kind := 'updated';
    else
      return null; -- only bookkeeping columns changed (updated_at, last_verified_at …)
    end if;
  end if;
  insert into tariff_price_history (tariff_id, change, provider, name, color, fixed_monthly_eur, price_per_kwh_eur,
    price_per_kwh_with_discount_eur, price_per_kwh_night_eur, valid_month, valid_from, valid_until, active, snapshot, changed_by, source_url)
  values (r.id, kind, r.provider, r.name, r.color, r.fixed_monthly_eur, r.price_per_kwh_eur,
    r.price_per_kwh_with_discount_eur, r.price_per_kwh_night_eur, r.valid_month, r.valid_from, r.valid_until, r.active,
    to_jsonb(r), coalesce(r.updated_by, 'system'), r.url);
  return null;
end $$;

drop trigger if exists tariffs_history on tariffs;
create trigger tariffs_history after insert or update or delete on tariffs
  for each row execute function billi_tariff_history();

-- Starting point for the tariffs that already exist.
insert into tariff_price_history (tariff_id, change, provider, name, color, fixed_monthly_eur, price_per_kwh_eur,
  price_per_kwh_with_discount_eur, price_per_kwh_night_eur, valid_month, valid_from, valid_until, active, snapshot, changed_by, source_url, changed_at)
select t.id, 'baseline', t.provider, t.name, t.color, t.fixed_monthly_eur, t.price_per_kwh_eur,
  t.price_per_kwh_with_discount_eur, t.price_per_kwh_night_eur, t.valid_month, t.valid_from, t.valid_until, t.active,
  to_jsonb(t), 'system', t.url, t.updated_at
from tariffs t
where not exists (select 1 from tariff_price_history h where h.tariff_id = t.id);

-- 5. Collection runs (one per source check)
create table if not exists tariff_update_logs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  trigger       text not null default 'cron' check (trigger in ('cron', 'manual')),
  admin         text,
  source_id     uuid references tariff_data_sources (id) on delete set null,
  provider_id   uuid references energy_providers (id) on delete set null,
  status        text not null default 'running' check (status in ('running', 'ok', 'unchanged', 'failed')),
  message       text,
  found         integer not null default 0,
  queued        integer not null default 0,
  verified      integer not null default 0,
  document_hash text,
  document_path text,
  documents     jsonb not null default '[]'
);
create index if not exists tariff_update_logs_started_idx on tariff_update_logs (started_at desc);
create index if not exists tariff_update_logs_source_idx on tariff_update_logs (source_id, started_at desc);

-- 6. Approval queue: nothing reaches `tariffs` before an administrator approves it
create table if not exists tariff_update_queue (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  run_id          uuid references tariff_update_logs (id) on delete set null,
  source_id       uuid references tariff_data_sources (id) on delete set null,
  provider_id     uuid references energy_providers (id) on delete set null,
  provider        text not null,
  program         text not null,
  dedupe_key      text not null,
  tariff_id       text,   -- the published row this changes; null for a new programme
  change_type     text not null check (change_type in ('new', 'price_change', 'details_change', 'discontinued')),
  old_values      jsonb,
  new_values      jsonb,
  changed_fields  text[] not null default '{}',
  flags           jsonb not null default '[]',
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  notes           text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  source_url      text,
  source_document text,
  evidence        text
);
create index if not exists tariff_update_queue_status_idx on tariff_update_queue (status, created_at desc);
create unique index if not exists tariff_update_queue_one_pending on tariff_update_queue (dedupe_key) where status = 'pending';

-- 7. Audit log of everything administrators do with tariff data
create table if not exists admin_activity_logs (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  admin           text not null,
  action          text not null,
  entity          text not null,
  entity_id       text,
  before          jsonb,
  after           jsonb,
  source_url      text,
  source_document text,
  note            text
);
create index if not exists admin_activity_logs_created_idx on admin_activity_logs (created_at desc);
create index if not exists admin_activity_logs_entity_idx on admin_activity_logs (entity, entity_id);

drop trigger if exists admin_activity_logs_append_only on admin_activity_logs;
create trigger admin_activity_logs_append_only before update or delete on admin_activity_logs
  for each row execute function billi_forbid_change();

-- 8. Row Level Security
-- The server uses the service role key. Visitors (anon key) may only read published, active tariffs;
-- everything else, the queue and the logs included, has no policy and is closed to them.
alter table energy_providers     enable row level security;
alter table tariff_data_sources  enable row level security;
alter table tariff_price_history enable row level security;
alter table tariff_update_logs   enable row level security;
alter table tariff_update_queue  enable row level security;
alter table admin_activity_logs  enable row level security;
alter table tariffs              enable row level security;

drop policy if exists "visitors read published tariffs" on tariffs;
create policy "visitors read published tariffs" on tariffs for select to anon, authenticated using (active);

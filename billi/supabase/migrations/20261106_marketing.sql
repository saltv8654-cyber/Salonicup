-- billi CRM phase 2: consent records, campaigns and their recipients. Safe to run more than once.
create table if not exists consent_records (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  lead_id      uuid references leads (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete cascade,
  purpose      text not null check (purpose in ('contact', 'marketing')),
  granted      boolean not null,
  source       text not null,   -- lead_form, unsubscribe_link, admin, account
  text_version text,            -- the wording the person saw
  actor        text             -- administrator, when changed from the CRM
);
create index if not exists consent_records_lead_idx on consent_records (lead_id, created_at desc);
alter table consent_records enable row level security;
-- Consent history is evidence: it is never edited or deleted (except with the person, on erasure).
create or replace function billi_consent_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'consent_records is append-only'; end if;
  return old;
end $$;
drop trigger if exists consent_records_no_update on consent_records;
create trigger consent_records_no_update before update on consent_records for each row execute function billi_consent_append_only();

create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null,
  name       text not null,
  segment    text not null,
  channel    text not null check (channel in ('email', 'viber', 'whatsapp')),
  subject    text,
  message    text not null
);

create table if not exists campaign_recipients (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  lead_id     uuid not null references leads (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  message     text not null,
  sent_at     timestamptz,
  error       text,
  unique (campaign_id, lead_id)
);
create index if not exists campaign_recipients_lead_idx on campaign_recipients (lead_id);
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;

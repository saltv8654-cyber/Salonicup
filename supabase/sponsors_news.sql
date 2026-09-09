-- ── Χορηγοί (μεγάλοι/μικροί) ──
create table if not exists sponsors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  logo_url   text,
  link_url   text,                             -- σύνδεσμος site χορηγού (κλικ στο λογότυπο)
  tier       text not null default 'minor',   -- 'major' | 'minor'
  sort       int  not null default 0,
  created_at timestamptz default now()
);
-- Αν ο πίνακας υπάρχει ήδη:
alter table sponsors add column if not exists link_url text;
alter table sponsors enable row level security;
drop policy if exists sponsors_read  on sponsors;
drop policy if exists sponsors_admin on sponsors;
create policy sponsors_read  on sponsors for select using (true);
create policy sponsors_admin on sponsors for all using (is_admin()) with check (is_admin());

-- ── Νέα / Άρθρα ──
create table if not exists articles (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  body       text not null default '',
  cover_url  text,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists articles_pub_idx on articles (published, created_at desc);
alter table articles enable row level security;
drop policy if exists articles_read  on articles;
drop policy if exists articles_admin on articles;
create policy articles_read  on articles for select using (published = true or is_admin());
create policy articles_admin on articles for all using (is_admin()) with check (is_admin());

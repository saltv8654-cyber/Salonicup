-- ═══════════════════════════════════════════════════════════
-- SALONICUP — Πλήρες σχήμα βάσης
-- Τρέξε το ολόκληρο στο Supabase → SQL Editor
-- ΠΡΟΣΟΧΗ: σβήνει ό,τι υπάρχει και ξαναχτίζει από την αρχή
-- ═══════════════════════════════════════════════════════════

-- ── Καθαρισμός ──
drop view   if exists player_stats cascade;
drop view   if exists standings cascade;
drop table  if exists events cascade;
drop table  if exists matches cascade;
drop table  if exists players cascade;
drop table  if exists teams cascade;
drop table  if exists slots cascade;
drop table  if exists venues cascade;
drop table  if exists leagues cascade;
drop table  if exists profiles cascade;
drop type   if exists match_status cascade;
drop type   if exists event_type cascade;
drop type   if exists match_period cascade;
drop type   if exists user_role cascade;
drop function if exists handle_new_user cascade;
drop function if exists recalc_score cascade;
drop function if exists touch_updated_at cascade;

-- ── Τύποι ──
create type user_role    as enum ('admin','speaker','captain','viewer');
create type match_status as enum ('Scheduled','Live','Played','Postponed','Forfeit');
create type match_period as enum ('H1','H2','ET','PEN');
create type event_type   as enum (
  'GOAL','OWN','ASSIST','YELLOW','RED','PEN_SCORED','PEN_MISSED'
);

-- ── Χρήστες ──
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  full_name   text,
  role        user_role not null default 'viewer',
  team_id     uuid,                      -- για αρχηγούς
  created_at  timestamptz default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'viewer')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Πρωταθλήματα ──
create table leagues (
  league_id   uuid primary key default gen_random_uuid(),
  name        text not null,
  season      text not null default '2025-26',
  logo_url    text,
  sort_order  int  not null default 0,
  active      bool not null default true,
  created_at  timestamptz default now()
);

-- ── Γήπεδα ──
create table venues (
  venue_id    uuid primary key default gen_random_uuid(),
  name        text not null,             -- π.χ. "Νικοκούδη"
  fields      text[] not null default '{}',  -- π.χ. {"Γήπ. 3","Γήπ. 4"}
  created_at  timestamptz default now()
);

-- ── Ομάδες ──
create table teams (
  team_id        uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues on delete cascade,
  name           text not null,
  logo_url       text,
  postponements  int  not null default 0,   -- όριο 2
  active         bool not null default true,
  created_at     timestamptz default now()
);
create index on teams (league_id);

alter table profiles
  add constraint profiles_team_fk
  foreign key (team_id) references teams (team_id) on delete set null;

-- ── Παίκτες ──
create table players (
  player_id   uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams on delete cascade,
  full_name   text not null,
  number      int,
  photo_url   text,
  active      bool not null default true,
  created_at  timestamptz default now()
);
create index on players (team_id);

-- ── Αγώνες ──
create table matches (
  match_id        uuid primary key default gen_random_uuid(),
  league_id       uuid not null references leagues on delete cascade,
  round           int  not null default 1,
  match_date      timestamptz,
  venue_id        uuid references venues on delete set null,
  field           text,
  team_a          uuid not null references teams on delete cascade,
  team_b          uuid not null references teams on delete cascade,
  goals_team_a    int  not null default 0,
  goals_team_b    int  not null default 0,
  pens_team_a     int  not null default 0,
  pens_team_b     int  not null default 0,
  match_status    match_status not null default 'Scheduled',
  report          text,                  -- κείμενο αγώνα
  mvp_player_id   uuid references players on delete set null,  -- MVP (χειροκίνητα από speaker)
  squad_a         uuid[] not null default '{}',   -- όσοι συμμετείχαν
  squad_b         uuid[] not null default '{}',
  squad_set_at    timestamptz,
  squad_set_by    uuid references profiles,
  updated_at      timestamptz default now(),
  updated_by      uuid references profiles,
  created_at      timestamptz default now(),
  constraint different_teams check (team_a <> team_b)
);
create index on matches (league_id, round);
create index on matches (match_status);
create index on matches (match_date);

-- ── Slots (πρόγραμμα γηπέδων) ──
create table slots (
  slot_id     uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues on delete cascade,
  field       text not null,
  starts_at   timestamptz not null,
  match_id    uuid references matches on delete set null,  -- null = ελεύθερο
  created_at  timestamptz default now(),
  unique (venue_id, field, starts_at)
);
create index on slots (starts_at);

-- ── Φάσεις ──
create table events (
  event_id    uuid primary key default gen_random_uuid(),
  match_id    uuid not null references matches on delete cascade,
  team_id     uuid not null references teams on delete cascade,
  player_id   uuid not null references players on delete cascade,
  event_type  event_type   not null,
  period      match_period not null default 'H1',
  minute      int,                       -- σχετικό με το ημίχρονο (1-30, >30 = καθυστερήσεις)
  created_at  timestamptz default now(),
  created_by  uuid references profiles,
  edited_at   timestamptz,
  edited_by   uuid references profiles
);
create index on events (match_id);
create index on events (player_id);

-- ═══════════════════════════════════════════════════════════
-- ΑΥΤΟΜΑΤΙΣΜΟΙ
-- ═══════════════════════════════════════════════════════════

-- Σκορ: γκολ + αυτογκόλ αντιπάλου. Πέναλτι χωριστά.
create function recalc_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  ta  uuid;
  tb  uuid;
begin
  mid := coalesce(new.match_id, old.match_id);
  select team_a, team_b into ta, tb from matches where match_id = mid;

  update matches set
    goals_team_a = (
      select count(*) from events
      where match_id = mid and period <> 'PEN'
        and ((event_type = 'GOAL' and team_id = ta)
          or (event_type = 'OWN'  and team_id = tb))
    ),
    goals_team_b = (
      select count(*) from events
      where match_id = mid and period <> 'PEN'
        and ((event_type = 'GOAL' and team_id = tb)
          or (event_type = 'OWN'  and team_id = ta))
    ),
    pens_team_a = (
      select count(*) from events
      where match_id = mid and event_type = 'PEN_SCORED' and team_id = ta
    ),
    pens_team_b = (
      select count(*) from events
      where match_id = mid and event_type = 'PEN_SCORED' and team_id = tb
    ),
    updated_at = now()
  where match_id = mid;

  return coalesce(new, old);
end $$;

create trigger events_recalc
  after insert or update or delete on events
  for each row execute function recalc_score();

-- Αναβολή → +1 στην ομάδα που τη ζήτησε
-- (ο admin ορίζει ποια, μέσω update στο teams.postponements)

create function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger matches_touch
  before update on matches
  for each row execute function touch_updated_at();

-- ═══════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════

create view standings as
with results as (
  select
    m.league_id, m.team_a as team_id,
    m.goals_team_a as gf, m.goals_team_b as ga,
    case when m.goals_team_a > m.goals_team_b then 3
         when m.goals_team_a = m.goals_team_b then 1 else 0 end as pts,
    case when m.goals_team_a > m.goals_team_b then 1 else 0 end as w,
    case when m.goals_team_a = m.goals_team_b then 1 else 0 end as d,
    case when m.goals_team_a < m.goals_team_b then 1 else 0 end as l
  from matches m
  where m.match_status in ('Played','Forfeit')
  union all
  select
    m.league_id, m.team_b,
    m.goals_team_b, m.goals_team_a,
    case when m.goals_team_b > m.goals_team_a then 3
         when m.goals_team_b = m.goals_team_a then 1 else 0 end,
    case when m.goals_team_b > m.goals_team_a then 1 else 0 end,
    case when m.goals_team_b = m.goals_team_a then 1 else 0 end,
    case when m.goals_team_b < m.goals_team_a then 1 else 0 end
  from matches m
  where m.match_status in ('Played','Forfeit')
)
select
  t.team_id,
  t.league_id,
  t.name          as team_name,
  t.logo_url,
  t.postponements,
  coalesce(count(r.team_id), 0)::int as played,
  coalesce(sum(r.w),   0)::int as wins,
  coalesce(sum(r.d),   0)::int as draws,
  coalesce(sum(r.l),   0)::int as losses,
  coalesce(sum(r.gf),  0)::int as goals_for,
  coalesce(sum(r.ga),  0)::int as goals_against,
  coalesce(sum(r.gf) - sum(r.ga), 0)::int as goal_diff,
  coalesce(sum(r.pts), 0)::int as points,
  row_number() over (
    partition by t.league_id
    order by coalesce(sum(r.pts),0) desc,
             coalesce(sum(r.gf)-sum(r.ga),0) desc,
             coalesce(sum(r.gf),0) desc,
             t.name
  )::int as position
from teams t
left join results r on r.team_id = t.team_id
where t.active
group by t.team_id, t.league_id, t.name, t.logo_url, t.postponements;

create view player_stats as
select
  p.player_id,
  p.team_id,
  t.league_id,
  p.full_name,
  p.number,
  p.photo_url,
  t.name as team_name,
  (select count(*) from matches m
     where m.match_status in ('Played','Forfeit','Live')
       and (p.player_id = any(m.squad_a) or p.player_id = any(m.squad_b))
  )::int as appearances,
  (select count(*) from events e
     where e.player_id = p.player_id and e.event_type='GOAL' and e.period<>'PEN')::int as goals,
  (select count(*) from events e
     where e.player_id = p.player_id and e.event_type='OWN')::int as own_goals,
  (select count(*) from events e
     where e.player_id = p.player_id and e.event_type='ASSIST')::int as assists,
  (select count(*) from events e
     where e.player_id = p.player_id and e.event_type='YELLOW')::int as yellow_cards,
  (select count(*) from events e
     where e.player_id = p.player_id and e.event_type='RED')::int as red_cards,
  (select count(*) from matches m
     where m.mvp_player_id = p.player_id)::int as mvp_awards
from players p
join teams t on t.team_id = p.team_id
where p.active;

-- ═══════════════════════════════════════════════════════════
-- ΑΣΦΑΛΕΙΑ (RLS)
-- ═══════════════════════════════════════════════════════════

alter table profiles enable row level security;
alter table leagues  enable row level security;
alter table venues   enable row level security;
alter table teams    enable row level security;
alter table players  enable row level security;
alter table matches  enable row level security;
alter table slots    enable row level security;
alter table events   enable row level security;

-- Δημόσια ανάγνωση
create policy public_read on leagues for select using (true);
create policy public_read on venues  for select using (true);
create policy public_read on teams   for select using (true);
create policy public_read on players for select using (true);
create policy public_read on matches for select using (true);
create policy public_read on slots   for select using (true);
create policy public_read on events  for select using (true);

create policy own_profile on profiles for select using (auth.uid() = id);

-- Βοηθητικά
create function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create function is_speaker() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','speaker'));
$$;

-- Admin: όλα
create policy admin_all on leagues  for all using (is_admin());
create policy admin_all on venues   for all using (is_admin());
create policy admin_all on teams    for all using (is_admin());
create policy admin_all on players  for all using (is_admin());
create policy admin_all on matches  for all using (is_admin());
create policy admin_all on slots    for all using (is_admin());
create policy admin_all on events   for all using (is_admin());
create policy admin_profiles on profiles for all using (is_admin());

-- Speaker: φάσεις + ενημέρωση αγώνα + φωτό/προσθήκη παίκτη
create policy speaker_events  on events  for all    using (is_speaker());
create policy speaker_matches on matches for update using (is_speaker());
create policy speaker_players on players for update using (is_speaker());
create policy speaker_players_insert on players for insert with check (is_speaker());
create policy speaker_players_delete on players for delete using (is_speaker());
-- ώστε ο speaker να βλέπει ποιος σπικερ καταχώρησε (όνομα από profiles)
create policy speaker_read_profiles on profiles for select using (is_speaker());

-- ── Realtime ──
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table matches;

-- ═══════════════════════════════════════════════════════════
-- STORAGE — ανέβασμα σημάτων/φωτογραφιών (buckets: logos, players)
-- ═══════════════════════════════════════════════════════════
-- Δημόσια ανάγνωση + ανέβασμα/αλλαγή/διαγραφή από συνδεδεμένους χρήστες.
update storage.buckets set public = true where id in ('logos','players');

drop policy if exists "read logos/players"   on storage.objects;
drop policy if exists "upload logos/players" on storage.objects;
drop policy if exists "update logos/players" on storage.objects;
drop policy if exists "delete logos/players" on storage.objects;

create policy "read logos/players" on storage.objects
  for select using (bucket_id in ('logos','players'));

create policy "upload logos/players" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('logos','players'));

create policy "update logos/players" on storage.objects
  for update to authenticated
  using (bucket_id in ('logos','players'))
  with check (bucket_id in ('logos','players'));

create policy "delete logos/players" on storage.objects
  for delete to authenticated
  using (bucket_id in ('logos','players'));

-- ═══════════════════════════════════════════════════════════
-- PUSH NOTIFICATIONS — συνδρομές συσκευών
-- ═══════════════════════════════════════════════════════════
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
-- Οποιοσδήποτε μπορεί να εγγραφεί· ανάγνωση/διαγραφή μόνο service role (send endpoint).
drop policy if exists push_insert on push_subscriptions;
create policy push_insert on push_subscriptions for insert with check (true);

-- Προτιμήσεις ειδοποιήσεων ανά συσκευή
alter table push_subscriptions add column if not exists notify_goal  boolean default true;
alter table push_subscriptions add column if not exists notify_start boolean default true;
alter table push_subscriptions add column if not exists notify_red   boolean default true;
alter table push_subscriptions add column if not exists notify_final boolean default true;
-- Λίστα πρωταθλημάτων· κενή/NULL = όλα
alter table push_subscriptions add column if not exists league_ids   text[] default '{}';

-- Ώστε τα DELETE των φάσεων να φτάνουν live στους θεατές
alter table events replica identity full;

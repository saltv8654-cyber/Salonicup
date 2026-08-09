-- Ομάδα της αγωνιστικής (Team of the Week) — τη δηλώνουν speakers/admin
-- Μία τρέχουσα ανά πρωτάθλημα (upsert). player_ids = θέσεις διάταξης (με NULL για κενές).
create table if not exists team_of_week (
  league_id  uuid primary key references leagues(league_id) on delete cascade,
  round      int,
  formation  text not null default '3-3-1',
  title      text not null default 'TEAM OF THE WEEK',
  player_ids uuid[] not null default '{}',
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table team_of_week enable row level security;
drop policy if exists tow_read on team_of_week;
create policy tow_read  on team_of_week for select using (true);
drop policy if exists tow_write on team_of_week;
create policy tow_write on team_of_week for all using (is_speaker()) with check (is_speaker());

-- Προτάσεις σπίκερ για την ομάδα της αγωνιστικής (μία ανά σπίκερ ανά πρωτάθλημα).
-- Ο admin βλέπει όλες τις προτάσεις και ορίζει την επίσημη ομάδα (team_of_week).
create table if not exists team_of_week_proposals (
  league_id   uuid not null references leagues(league_id) on delete cascade,
  speaker_id  uuid not null references auth.users(id) on delete cascade,
  round       int,
  player_ids  uuid[] not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (league_id, speaker_id)
);

alter table team_of_week_proposals enable row level security;
-- Διάβασμα: κάθε speaker/admin βλέπει όλες τις προτάσεις
drop policy if exists towp_read on team_of_week_proposals;
create policy towp_read on team_of_week_proposals for select using (is_speaker());
-- Γράψιμο: μόνο τη δική του πρόταση
drop policy if exists towp_write on team_of_week_proposals;
create policy towp_write on team_of_week_proposals for all
  using (auth.uid() = speaker_id and is_speaker())
  with check (auth.uid() = speaker_id and is_speaker());

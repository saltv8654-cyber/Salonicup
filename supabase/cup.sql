-- ── Κύπελλο (φορμά Μουντιάλ 2026: 48 ομάδες, 12 όμιλοι × 4) ──
-- Το Κύπελλο μοντελοποιείται ως ειδικό «πρωτάθλημα» (leagues.format = 'cup'),
-- ώστε οι αγώνες του να δουλεύουν αυτόματα με σπίκερ/overlay/σελίδες αγώνα.

alter table leagues add column if not exists is_cup boolean not null default false;    -- true = Κύπελλο
alter table matches add column if not exists cup_group text;                            -- 'A'..'L' (φάση ομίλων)

-- Συμμετοχές ομάδων στο κύπελλο + όμιλος μετά την κλήρωση
create table if not exists cup_teams (
  cup_id   uuid not null references leagues(league_id) on delete cascade,
  team_id  uuid not null references teams(team_id)   on delete cascade,
  grp      text,                 -- 'A'..'L' (null πριν την κλήρωση)
  seed     int,                  -- σειρά στην κλήρωση (προαιρετικό)
  primary key (cup_id, team_id)
);
create index if not exists cup_teams_cup_idx on cup_teams (cup_id);

alter table cup_teams enable row level security;
create policy cup_teams_read  on cup_teams for select using (true);
create policy cup_teams_admin on cup_teams for all using (is_admin()) with check (is_admin());

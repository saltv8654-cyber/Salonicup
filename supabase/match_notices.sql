-- ── Μηνύματα αλλαγών αγώνα προς τις ομάδες (in-app banner για captains) ──
create table if not exists match_notices (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid references matches(match_id) on delete cascade,
  team_id    uuid references teams(team_id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists match_notices_team_idx on match_notices (team_id, created_at desc);

alter table match_notices enable row level security;
drop policy if exists mn_read  on match_notices;
drop policy if exists mn_admin on match_notices;
create policy mn_read  on match_notices for select using (auth.role() = 'authenticated');
create policy mn_admin on match_notices for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';

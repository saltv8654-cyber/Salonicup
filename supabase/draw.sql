-- ── Κλήρωση (draw) ανά πρωτάθλημα: θέση (1..N) → ομάδα ──
create table if not exists draw_slots (
  league_id uuid not null references leagues(league_id) on delete cascade,
  slot      int  not null,
  team_id   uuid references teams(team_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (league_id, slot)
);
alter table draw_slots enable row level security;

drop policy if exists draw_read  on draw_slots;
drop policy if exists draw_admin on draw_slots;
create policy draw_read  on draw_slots for select using (true);
create policy draw_admin on draw_slots for all using (is_admin()) with check (is_admin());

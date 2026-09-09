-- ── Απαντήσεις captain σε αγώνα ──
-- Ο captain κάθε ομάδας δηλώνει αν είναι ΟΚ με τον προγραμματισμένο αγώνα,
-- ή ζητά αλλαγή ώρας / αναβολή (με προαιρετικό σχόλιο). Μία απάντηση ανά ομάδα.
create table if not exists match_responses (
  match_id   uuid not null references matches(match_id) on delete cascade,
  team_id    uuid not null references teams(team_id) on delete cascade,
  user_id    uuid references profiles(id),
  status     text not null default 'ok',   -- 'ok' | 'reschedule' | 'postpone'
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, team_id)
);

alter table match_responses enable row level security;

drop policy if exists mr_read  on match_responses;
drop policy if exists mr_write on match_responses;

-- Διάβασμα: όλοι οι συνδεδεμένοι (ο κάθε captain βλέπει και της αντίπαλης ομάδας, ο admin τα πάντα)
create policy mr_read on match_responses
  for select using (auth.role() = 'authenticated');

-- Γράψιμο: μόνο για τη ΔΙΚΗ σου ομάδα (ή admin)
create policy mr_write on match_responses
  for all
  using (is_admin() or team_id = (select team_id from profiles where id = auth.uid()))
  with check (is_admin() or team_id = (select team_id from profiles where id = auth.uid()));

notify pgrst, 'reload schema';

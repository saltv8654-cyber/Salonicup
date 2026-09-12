-- ── Ειδοποιήσεις διαχειριστή (καμπανάκι στο header, στυλ Facebook) ──
-- Γεμίζει ΑΥΤΟΜΑΤΑ μέσω triggers:
--   • όταν captain απαντά σε αγώνα (ΟΚ / αλλαγή ώρας / αναβολή)
--   • όταν γίνεται νέα εγγραφή χρήστη (profiles)
create table if not exists admin_notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,                 -- 'response' | 'signup'
  title      text not null,
  body       text,
  url        text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists admin_notifications_idx on admin_notifications (read, created_at desc);

alter table admin_notifications enable row level security;
drop policy if exists an_read  on admin_notifications;
drop policy if exists an_admin on admin_notifications;
-- Μόνο admin διαβάζει/ενημερώνει (mark-as-read)
create policy an_read  on admin_notifications for select using (is_admin());
create policy an_admin on admin_notifications for all using (is_admin()) with check (is_admin());

-- Realtime (για live άφιξη χωρίς refresh)
do $$ begin
  alter publication supabase_realtime add table admin_notifications;
exception when duplicate_object then null; when others then null; end $$;

-- ── Trigger: απάντηση captain ──
create or replace function notify_admin_response() returns trigger as $$
declare
  resp_team text;
  a_name    text;
  b_name    text;
  st_label  text;
begin
  -- Ειδοποίηση σε νέα εγγραφή ή όταν αλλάζει το status
  if tg_op = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  st_label := case NEW.status
    when 'ok' then 'είναι ΟΚ'
    when 'reschedule' then 'ζητά αλλαγή ώρας'
    when 'postpone' then 'ζητά αναβολή'
    else NEW.status end;

  select name into resp_team from teams where team_id = NEW.team_id;
  select ta.name, tb.name into a_name, b_name
    from matches m
    left join teams ta on ta.team_id = m.team_a
    left join teams tb on tb.team_id = m.team_b
   where m.match_id = NEW.match_id;

  insert into admin_notifications (kind, title, body, url)
  values (
    'response',
    coalesce(resp_team, 'Ομάδα') || ' ' || st_label,
    coalesce(a_name, '—') || ' – ' || coalesce(b_name, '—')
      || case when coalesce(NEW.note, '') <> '' then ' · «' || NEW.note || '»' else '' end,
    '/admin/matches'
  );
  return NEW;
end; $$ language plpgsql security definer;

drop trigger if exists trg_notify_response on match_responses;
create trigger trg_notify_response
  after insert or update of status on match_responses
  for each row execute function notify_admin_response();

-- ── Trigger: νέα εγγραφή χρήστη ──
create or replace function notify_admin_signup() returns trigger as $$
begin
  insert into admin_notifications (kind, title, body, url)
  values (
    'signup',
    'Νέα εγγραφή',
    coalesce(nullif(trim(NEW.full_name), ''), NEW.email, 'Άγνωστος χρήστης'),
    '/admin/users'
  );
  return NEW;
end; $$ language plpgsql security definer;

drop trigger if exists trg_notify_signup on profiles;
create trigger trg_notify_signup
  after insert on profiles
  for each row execute function notify_admin_signup();

notify pgrst, 'reload schema';

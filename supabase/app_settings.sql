-- ========================================================================
-- Salonicup · Καθολικές ρυθμίσεις (χορηγοί «powered by») — τρέξε το ΜΙΑ φορά
-- ========================================================================

create table if not exists public.app_settings (
  id         int primary key default 1,
  sponsors   text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Δημόσια ανάγνωση (το overlay τους διαβάζει), εγγραφή μόνο admin
drop policy if exists app_settings_read  on public.app_settings;
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_read  on public.app_settings for select using (true);
create policy app_settings_admin on public.app_settings for all    using (is_admin());

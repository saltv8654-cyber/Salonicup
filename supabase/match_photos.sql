-- ── Φωτογραφίες αγώνα (gallery στη σελίδα αγώνα, δημόσιες στο salonicup.gr) ──

-- Πίνακας φωτογραφιών
create table if not exists match_photos (
  photo_id    uuid primary key default gen_random_uuid(),
  match_id    uuid not null references matches(match_id) on delete cascade,
  url         text not null,
  sort        int  not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists match_photos_match_idx on match_photos (match_id, sort, created_at);

alter table match_photos enable row level security;

-- Ποιος μπορεί να ανεβάζει/σβήνει: admin, speaker, photographer
create or replace function can_photo() returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin','speaker','photographer')
  );
$$;

drop policy if exists match_photos_read  on match_photos;
drop policy if exists match_photos_write on match_photos;
create policy match_photos_read  on match_photos for select using (true);
create policy match_photos_write on match_photos for all using (can_photo()) with check (can_photo());

-- Storage bucket (δημόσιο για ανάγνωση)
insert into storage.buckets (id, name, public)
values ('match-photos', 'match-photos', true)
on conflict (id) do nothing;

drop policy if exists "match photos read"   on storage.objects;
drop policy if exists "match photos write"  on storage.objects;
drop policy if exists "match photos delete" on storage.objects;
create policy "match photos read"  on storage.objects for select
  using (bucket_id = 'match-photos');
create policy "match photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'match-photos' and can_photo());
create policy "match photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'match-photos' and can_photo());

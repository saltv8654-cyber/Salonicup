-- Phase 2: Creative Studio / Asset Library. Ασφαλές να ξανατρέξει.
alter table social_assets add column if not exists title text;
alter table social_assets add column if not exists bytes int;
alter table social_assets add column if not exists archived boolean not null default false;
create index if not exists social_assets_idx on social_assets(archived, created_at desc);
create index if not exists social_assets_match_idx on social_assets(match_id);

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('social-assets', 'social-assets', false) on conflict (id) do nothing;
  end if;
end $$;

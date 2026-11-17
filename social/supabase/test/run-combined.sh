#!/usr/bin/env bash
# Checks the single-file setup on top of the real Salonicup schema, twice.
set -euo pipefail
cd "$(dirname "$0")/.."
SQL="$1"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
DIR="$(mktemp -d)"
trap '"$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true' EXIT
if [ "$(id -un)" = "root" ]; then RUN="su postgres -s /bin/bash -c"; chown -R postgres "$DIR"; else RUN="bash -c"; fi
$RUN "'$PGBIN/initdb' -D '$DIR/data' -U postgres >/dev/null"
$RUN "'$PGBIN/pg_ctl' -D '$DIR/data' -o '-k $DIR -p 54330 -c listen_addresses=' -l '$DIR/log' start >/dev/null"
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -h $DIR -p 54330 -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
# Supabase stand-ins: auth schema and roles only (no stubbed profiles: the real schema.sql makes them)
$PSQL <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create publication supabase_realtime;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
SQL
$PSQL -f test/grants_local.sql
$PSQL -f ../../schema.sql >/dev/null
echo "Salonicup schema.sql: OK"
$PSQL -f "$SQL"; echo "1st run: OK"
$PSQL -f "$SQL"; echo "2nd run: OK"
$PSQL -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a','a@test'); update profiles set role='admin';" >/dev/null
$PSQL -tA -c "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false); select 'admin sees settings: ' || count(*) from social_settings; select 'schedules: ' || string_agg(workflow||'@'||weekday, ', ' order by workflow) from social_schedules;" | grep -v "^0000"
$PSQL -tA -c "select 'tables: ' || count(*) from information_schema.tables where table_schema='public' and table_name like 'social_%'"

-- Supabase's default privileges on the public schema: anything created later is granted
-- to anon/authenticated/service_role. Applied BEFORE the migration, like on Supabase.
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

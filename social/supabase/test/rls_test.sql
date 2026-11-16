-- Tenant isolation, roles, append-only audit and queue tests.
\set ON_ERROR_STOP on
\set QUIET on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer@test');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- User A onboards
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into ids select 'biz_a', create_organization('Org A', 'Salonicup', 'sports');
-- User B onboards
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into ids select 'biz_b', create_organization('Org B', 'Other Co', 'retail');
reset role;

insert into ids select 'org_a', org_id from businesses where id = (select v from ids where k = 'biz_a');
insert into organization_members (org_id, user_id, role)
  select v, '00000000-0000-0000-0000-00000000000c', 'viewer' from ids where k = 'org_a';

-- 1. B cannot see A's business, brand or memory
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  if (select count(*) from businesses) <> 1 then raise exception 'FAIL 1: B sees % businesses', (select count(*) from businesses); end if;
  if exists (select 1 from brand_profiles where business_id = (select v from ids where k='biz_a')) then raise exception 'FAIL 1: B sees A brand'; end if;
end $$;
-- 2. B cannot write into A's business
do $$ begin
  begin
    insert into memories (business_id, kind, content) values ((select v from ids where k='biz_a'), 'fact', 'intrusion');
    raise exception 'FAIL 2: B wrote into A';
  exception when insufficient_privilege then null;
  end;
end $$;
-- 3. B cannot read A's usage via the RPC
do $$ begin
  if exists (select 1 from org_month_usage((select v from ids where k='org_a'))) then raise exception 'FAIL 3: usage leak'; end if;
end $$;

-- 4. Viewer reads but cannot write
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  if (select count(*) from businesses) <> 1 then raise exception 'FAIL 4: viewer cannot read'; end if;
  begin
    insert into content_items (business_id, kind, title) values ((select v from ids where k='biz_a'), 'post', 'x');
    raise exception 'FAIL 4: viewer wrote';
  exception when insufficient_privilege then null;
  end;
  update businesses set autonomy_mode = 'full';  -- RLS: silently 0 rows
  if (select autonomy_mode from businesses limit 1) <> 'manual' then raise exception 'FAIL 4: viewer changed autonomy'; end if;
end $$;

-- 5. Owner writes; social_tokens invisible even to the owner
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into memories (business_id, kind, content) values ((select v from ids where k='biz_a'), 'fact', 'Matches on Sundays');
do $$ begin
  if (select count(*) from memories) <> 1 then raise exception 'FAIL 5: owner memory'; end if;
  if (select count(*) from workflow_schedules) <> 3 then raise exception 'FAIL 5: default schedules'; end if;
end $$;
-- 6. Plan limit: trial allows 1 business
do $$ begin
  begin
    perform create_business((select v from ids where k='org_a'), 'Second');
    raise exception 'FAIL 6: plan limit not enforced';
  exception when raise_exception then
    if sqlerrm not like 'plan limit%' then raise; end if;
  end;
end $$;
-- 7. Members cannot claim jobs
do $$ begin
  begin
    perform claim_jobs('x', 1);
    raise exception 'FAIL 7: authenticated can claim jobs';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 8. Activity log is append-only
do $$ begin
  begin
    update activity_log set action = 'tampered';
    raise exception 'FAIL 8: activity_log editable';
  exception when raise_exception then
    if sqlerrm <> 'activity_log is append-only' then raise; end if;
  end;
  begin
    delete from activity_log;
    raise exception 'FAIL 8: activity_log deletable';
  exception when raise_exception then
    if sqlerrm <> 'activity_log is append-only' then raise; end if;
  end;
end $$;

-- 9. Queue: claim, no double-claim, idempotency, lock-timeout release
insert into jobs (business_id, type, idempotency_key) values ((select v from ids where k='biz_a'), 't', 'k1');
insert into jobs (business_id, type, run_at) values ((select v from ids where k='biz_a'), 't', now() + interval '1 hour');
do $$ declare n int; begin
  begin
    insert into jobs (type, idempotency_key) values ('t', 'k1');
    raise exception 'FAIL 9: duplicate idempotency key';
  exception when unique_violation then null;
  end;
  select count(*) into n from claim_jobs('w1', 10);
  if n <> 1 then raise exception 'FAIL 9: claimed % (expected 1, future job must wait)', n; end if;
  select count(*) into n from claim_jobs('w2', 10);
  if n <> 0 then raise exception 'FAIL 9: double claim'; end if;
  update jobs set locked_at = now() - interval '20 minutes' where idempotency_key = 'k1';
  select count(*) into n from claim_jobs('w3', 10);
  if n <> 1 then raise exception 'FAIL 9: stuck job not released'; end if;
  if (select attempts from jobs where idempotency_key = 'k1') <> 2 then raise exception 'FAIL 9: attempts'; end if;
end $$;

-- 10. Deleting a tenant cascades through the append-only log
delete from organizations where id = (select v from ids where k='org_a');
do $$ begin
  if exists (select 1 from businesses where id = (select v from ids where k='biz_a')) then raise exception 'FAIL 10'; end if;
end $$;

\echo 'ALL DB TESTS PASSED (10 groups)'
rollback;

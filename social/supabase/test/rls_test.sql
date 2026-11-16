-- Access, append-only audit and queue tests for the social_* tables.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('00000000-0000-0000-0000-00000000000b', 'speaker@test'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer@test');
insert into profiles (id, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'speaker@test', 'speaker'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer@test', 'viewer');
grant select on profiles to authenticated;

-- 1. Seed rows exist
do $$ begin
  if (select count(*) from social_settings) <> 1 then raise exception 'FAIL 1: settings row'; end if;
  if (select count(*) from social_schedules) <> 3 then raise exception 'FAIL 1: schedules'; end if;
  if (select brand_name from social_settings) <> 'Salonicup' then raise exception 'FAIL 1: brand'; end if;
end $$;
insert into social_memories (kind, content) values ('fact', 'Αγώνες κάθε Σαββατοκύριακο');
insert into social_approvals (action, summary) values ('schedule_post', 'test');

-- 2. Non-admins (speaker, viewer, anonymous) see and change nothing
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  if exists (select 1 from social_settings) or exists (select 1 from social_memories) or exists (select 1 from social_approvals)
    then raise exception 'FAIL 2: speaker can read'; end if;
  update social_settings set autonomy_mode = 'full';
  begin
    insert into social_memories (kind, content) values ('fact', 'x');
    raise exception 'FAIL 2: speaker wrote';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if exists (select 1 from social_memories) then raise exception 'FAIL 2: anonymous can read'; end if;
end $$;

-- 3. Admin reads and edits settings/memory, but only reads approvals and cannot touch tokens
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  if (select count(*) from social_memories) <> 1 then raise exception 'FAIL 3: admin read'; end if;
  update social_settings set tone = 'χιουμοριστικός';
  if (select tone from social_settings) <> 'χιουμοριστικός' then raise exception 'FAIL 3: admin edit'; end if;
  if (select count(*) from social_approvals) <> 1 then raise exception 'FAIL 3: admin cannot read approvals'; end if;
  update social_approvals set status = 'approved';  -- no write policy: 0 rows
  if (select status from social_approvals) <> 'pending' then raise exception 'FAIL 3: approvals writable from browser'; end if;
  if exists (select 1 from social_tokens) then raise exception 'FAIL 3: tokens visible'; end if;
end $$;
-- 4. Conversations: admin may only create their own
do $$ begin
  insert into social_conversations (user_id, title) values ('00000000-0000-0000-0000-00000000000a', 'ok');
  begin
    insert into social_conversations (user_id, title) values ('00000000-0000-0000-0000-00000000000b', 'spoof');
    raise exception 'FAIL 4: spoofed owner';
  exception when insufficient_privilege then null;
  end;
end $$;
-- 5. Browser users cannot claim jobs
do $$ begin
  begin
    perform social_claim_jobs('x', 1);
    raise exception 'FAIL 5: authenticated can claim jobs';
  exception when insufficient_privilege then null;
  end;
end $$;
-- 6. Only one settings row can ever exist
do $$ begin
  begin
    insert into social_settings (id) values (false);
    raise exception 'FAIL 6: second settings row';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- 7. Activity log is append-only, even for the service role
insert into social_activity (actor_type, action) values ('system', 'test');
do $$ begin
  begin update social_activity set action = 'x'; raise exception 'FAIL 7: editable';
  exception when raise_exception then if sqlerrm <> 'social_activity is append-only' then raise; end if; end;
  begin delete from social_activity; raise exception 'FAIL 7: deletable';
  exception when raise_exception then if sqlerrm <> 'social_activity is append-only' then raise; end if; end;
end $$;

-- 8. Queue: future jobs wait, no double claim, idempotency, lock-timeout release
insert into social_jobs (type, idempotency_key) values ('t', 'k1');
insert into social_jobs (type, run_at) values ('t', now() + interval '1 hour');
do $$ declare n int; begin
  begin insert into social_jobs (type, idempotency_key) values ('t', 'k1'); raise exception 'FAIL 8: duplicate key';
  exception when unique_violation then null; end;
  select count(*) into n from social_claim_jobs('w1', 10);
  if n <> 1 then raise exception 'FAIL 8: claimed %', n; end if;
  select count(*) into n from social_claim_jobs('w2', 10);
  if n <> 0 then raise exception 'FAIL 8: double claim'; end if;
  update social_jobs set locked_at = now() - interval '20 minutes' where idempotency_key = 'k1';
  select count(*) into n from social_claim_jobs('w3', 10);
  if n <> 1 then raise exception 'FAIL 8: stuck job not released'; end if;
end $$;

-- 9. Monthly cost
insert into social_ai_usage (model, cost_usd) values ('m', 1.25), ('m', 0.75);
insert into social_ai_usage (model, cost_usd, created_at) values ('m', 99, now() - interval '40 days');
do $$ begin
  if social_month_cost() <> 2 then raise exception 'FAIL 9: month cost %', social_month_cost(); end if;
end $$;

\echo 'ALL DB TESTS PASSED (9 groups)'
rollback;

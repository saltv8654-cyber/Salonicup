-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Salonicup Bet — στοίχημα με πόντους (χωρίς λεφτά)                  ║
-- ║  Τρέξε το ΟΛΟΚΛΗΡΟ στο Supabase → SQL Editor.                       ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- 1) Πορτοφόλι πόντων ανά χρήστη (ξεκινά με 1000)
create table if not exists bet_wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  points     numeric(12,2) not null default 1000,
  updated_at timestamptz not null default now()
);

-- 2) Δημοσιευμένες αποδόσεις ανά αγώνα (τις υπολογίζει/δημοσιεύει ο admin)
create table if not exists bet_odds (
  match_id   uuid primary key references matches(match_id) on delete cascade,
  home       numeric(6,2), draw numeric(6,2), away numeric(6,2),
  over25     numeric(6,2), under25 numeric(6,2),
  btts_yes   numeric(6,2), btts_no numeric(6,2),
  p_home     numeric, p_draw numeric, p_away numeric,   -- πιθανότητες (για διαφάνεια)
  updated_at timestamptz not null default now()
);

-- 3) Κουπόνια
create table if not exists bets (
  bet_id     uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  match_id   uuid not null references matches(match_id) on delete cascade,
  market     text not null,                 -- '1X2' | 'OU25' | 'BTTS'
  selection  text not null,                 -- 1X2: '1'|'X'|'2' · OU25: 'O'|'U' · BTTS: 'Y'|'N'
  odds       numeric(6,2) not null,         -- κλειδώνεται τη στιγμή του στοιχήματος
  stake      numeric(12,2) not null check (stake > 0),
  status     text not null default 'pending', -- pending|won|lost|void
  payout     numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists bets_user_idx  on bets(user_id);
create index if not exists bets_match_idx on bets(match_id);

-- ── RLS ──
alter table bet_wallets enable row level security;
alter table bet_odds    enable row level security;
alter table bets        enable row level security;

drop policy if exists wallet_read on bet_wallets;
create policy wallet_read on bet_wallets for select using (true);   -- δημόσια κατάταξη

drop policy if exists odds_read on bet_odds;
create policy odds_read  on bet_odds for select using (true);
drop policy if exists odds_admin on bet_odds;
create policy odds_admin on bet_odds for all using (is_admin()) with check (is_admin());

drop policy if exists bets_read on bets;
create policy bets_read   on bets for select using (auth.uid() = user_id or is_admin());
-- (η εισαγωγή γίνεται ΜΟΝΟ μέσω place_bet· δεν δίνουμε insert policy)

-- ── Δημόσια κατάταξη (ονόματα + πόντοι, χωρίς email) ──
create or replace view bet_leaderboard as
  select w.user_id, coalesce(profiles.full_name, 'Παίκτης') as name, w.points, w.updated_at
  from bet_wallets w left join profiles on profiles.id = w.user_id;

-- ── place_bet: κλείδωμα απόδοσης + κράτηση πόντων (ατομικά) ──
create or replace function place_bet(p_match uuid, p_market text, p_selection text, p_stake numeric)
returns bets language plpgsql security definer set search_path = public as $$
declare o bet_odds; m matches; v_odds numeric; w bet_wallets; b bets;
begin
  if auth.uid() is null then raise exception 'Πρέπει να συνδεθείς'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'Άκυρο ποσό'; end if;

  select * into m from matches where match_id = p_match;
  if not found then raise exception 'Ο αγώνας δεν βρέθηκε'; end if;
  if m.match_status <> 'Scheduled' then raise exception 'Το στοίχημα έκλεισε'; end if;

  select * into o from bet_odds where match_id = p_match;
  if not found then raise exception 'Δεν υπάρχουν αποδόσεις'; end if;

  v_odds := case p_market
    when '1X2'  then case p_selection when '1' then o.home when 'X' then o.draw when '2' then o.away end
    when 'OU25' then case p_selection when 'O' then o.over25 when 'U' then o.under25 end
    when 'BTTS' then case p_selection when 'Y' then o.btts_yes when 'N' then o.btts_no end
  end;
  if v_odds is null then raise exception 'Άκυρη επιλογή'; end if;

  insert into bet_wallets(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into w from bet_wallets where user_id = auth.uid() for update;
  if w.points < p_stake then raise exception 'Δεν έχεις αρκετούς πόντους'; end if;

  update bet_wallets set points = points - p_stake, updated_at = now() where user_id = auth.uid();
  insert into bets(user_id, match_id, market, selection, odds, stake)
    values (auth.uid(), p_match, p_market, p_selection, v_odds, p_stake)
  returning * into b;
  return b;
end $$;

revoke all on function place_bet(uuid, text, text, numeric) from public;
grant execute on function place_bet(uuid, text, text, numeric) to authenticated;

-- ── Εκκαθάριση αγώνα: κερδισμένα/χαμένα + πληρωμή νικητών ──
create or replace function bet_settle_match(p_match uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare m matches; res text; total int; ou text; gg text; r bets; n int := 0; won boolean;
begin
  select * into m from matches where match_id = p_match;
  if not found then return 0; end if;
  if m.match_status not in ('Played','Forfeit') then return 0; end if;

  res   := case when m.goals_team_a > m.goals_team_b then '1'
                when m.goals_team_a < m.goals_team_b then '2' else 'X' end;
  total := coalesce(m.goals_team_a,0) + coalesce(m.goals_team_b,0);
  ou    := case when total >= 3 then 'O' else 'U' end;
  gg    := case when coalesce(m.goals_team_a,0) > 0 and coalesce(m.goals_team_b,0) > 0 then 'Y' else 'N' end;

  for r in select * from bets where match_id = p_match and status = 'pending' loop
    won := (r.market = '1X2'  and r.selection = res)
        or (r.market = 'OU25' and r.selection = ou)
        or (r.market = 'BTTS' and r.selection = gg);
    if won then
      update bets set status = 'won', payout = round(r.stake * r.odds, 2), settled_at = now()
        where bet_id = r.bet_id;
      insert into bet_wallets(user_id) values (r.user_id) on conflict (user_id) do nothing;
      update bet_wallets set points = points + round(r.stake * r.odds, 2), updated_at = now()
        where user_id = r.user_id;
    else
      update bets set status = 'lost', payout = 0, settled_at = now() where bet_id = r.bet_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Ακύρωση (αναβολή): επιστροφή πόντων ──
create or replace function bet_void_match(p_match uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r bets; n int := 0;
begin
  for r in select * from bets where match_id = p_match and status = 'pending' loop
    update bets set status = 'void', payout = r.stake, settled_at = now() where bet_id = r.bet_id;
    insert into bet_wallets(user_id) values (r.user_id) on conflict (user_id) do nothing;
    update bet_wallets set points = points + r.stake, updated_at = now() where user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function bet_settle_match(uuid) from public;
revoke all on function bet_void_match(uuid)   from public;

-- ── Trigger: αυτόματη εκκαθάριση όταν αλλάζει η κατάσταση του αγώνα ──
create or replace function bet_on_match_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.match_status is distinct from OLD.match_status then
    if NEW.match_status in ('Played','Forfeit') then perform bet_settle_match(NEW.match_id);
    elsif NEW.match_status = 'Postponed'         then perform bet_void_match(NEW.match_id);
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_bet_settle on matches;
create trigger trg_bet_settle after update of match_status on matches
  for each row execute function bet_on_match_status();

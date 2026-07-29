-- ========================================================================
-- Salonicup · Playoffs — τρέξε το ΜΙΑ φορά στο Supabase → SQL Editor
-- ========================================================================
-- 1) Φάση αγώνα: null/'regular' = κανονική περίοδος · 'QF'|'SF'|'Final' = playoff
alter table matches add column if not exists stage text;
create index if not exists matches_stage_idx on matches (league_id, stage);

-- 2) Η ΒΑΘΜΟΛΟΓΙΑ μετράει ΜΟΝΟ regular season (τα playoff εξαιρούνται)
create or replace view standings as
with results as (
  select
    m.league_id, m.team_a as team_id,
    m.goals_team_a as gf, m.goals_team_b as ga,
    case when m.goals_team_a > m.goals_team_b then 3
         when m.goals_team_a = m.goals_team_b then 1 else 0 end as pts,
    case when m.goals_team_a > m.goals_team_b then 1 else 0 end as w,
    case when m.goals_team_a = m.goals_team_b then 1 else 0 end as d,
    case when m.goals_team_a < m.goals_team_b then 1 else 0 end as l
  from matches m
  where m.match_status in ('Played','Forfeit')
    and coalesce(m.stage,'regular') = 'regular'
  union all
  select
    m.league_id, m.team_b,
    m.goals_team_b, m.goals_team_a,
    case when m.goals_team_b > m.goals_team_a then 3
         when m.goals_team_b = m.goals_team_a then 1 else 0 end,
    case when m.goals_team_b > m.goals_team_a then 1 else 0 end,
    case when m.goals_team_b = m.goals_team_a then 1 else 0 end,
    case when m.goals_team_b < m.goals_team_a then 1 else 0 end
  from matches m
  where m.match_status in ('Played','Forfeit')
    and coalesce(m.stage,'regular') = 'regular'
)
select
  t.team_id,
  t.league_id,
  t.name          as team_name,
  t.logo_url,
  t.postponements,
  coalesce(count(r.team_id), 0)::int as played,
  coalesce(sum(r.w),   0)::int as wins,
  coalesce(sum(r.d),   0)::int as draws,
  coalesce(sum(r.l),   0)::int as losses,
  coalesce(sum(r.gf),  0)::int as goals_for,
  coalesce(sum(r.ga),  0)::int as goals_against,
  coalesce(sum(r.gf) - sum(r.ga), 0)::int as goal_diff,
  coalesce(sum(r.pts), 0)::int as points,
  row_number() over (
    partition by t.league_id
    order by coalesce(sum(r.pts),0) desc,
             coalesce(sum(r.gf)-sum(r.ga),0) desc,
             coalesce(sum(r.gf),0) desc,
             t.name
  )::int as position
from teams t
left join results r on r.team_id = t.team_id
where t.active
group by t.team_id, t.league_id, t.name, t.logo_url, t.postponements;

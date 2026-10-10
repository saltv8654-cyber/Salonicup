-- ========================================================================
-- Salonicup · Βαθμολογία: ΒΑΣΙΚΗ (standings) + ΖΩΝΤΑΝΗ (standings_live)
-- Τρέξε το ΜΙΑ φορά στο Supabase → SQL Editor.
--
-- Γιατί δύο views:
--   • standings       → μετράει ΜΟΝΟ τελειωμένους (Played/Forfeit). Το χρησιμοποιούν
--                        playoff seeding, εικόνες (post/OG), scoreboard (που προσθέτει
--                        ΜΟΝΟ του το τρέχον live σκορ), bets, ομάδες κ.λπ.
--   • standings_live  → μετράει ΚΑΙ τους live αγώνες (με το τρέχον σκορ). Το χρησιμοποιεί
--                        ΜΟΝΟ η δημόσια σελίδα «Βαθμολογία».
--
-- Έτσι λύνεται το διπλομέτρημα στο scoreboard: εκεί η view ΔΕΝ περιέχει live,
-- και ο κώδικας προσθέτει το τρέχον ματς μία φορά.
-- ========================================================================

-- ── 1) ΒΑΣΙΚΗ βαθμολογία (μόνο Played/Forfeit) ──
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
  t.team_id, t.league_id, t.name as team_name, t.logo_url, t.postponements,
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
             coalesce(sum(r.gf),0) desc, t.name
  )::int as position
from teams t
left join results r on r.team_id = t.team_id
where t.active
group by t.team_id, t.league_id, t.name, t.logo_url, t.postponements;

-- ── 2) ΖΩΝΤΑΝΗ βαθμολογία (Played/Forfeit/Live) — ΜΟΝΟ για τη δημόσια σελίδα ──
create or replace view standings_live as
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
  where m.match_status in ('Played','Forfeit','Live')
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
  where m.match_status in ('Played','Forfeit','Live')
    and coalesce(m.stage,'regular') = 'regular'
)
select
  t.team_id, t.league_id, t.name as team_name, t.logo_url, t.postponements,
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
             coalesce(sum(r.gf),0) desc, t.name
  )::int as position
from teams t
left join results r on r.team_id = t.team_id
where t.active
group by t.team_id, t.league_id, t.name, t.logo_url, t.postponements;

notify pgrst, 'reload schema';

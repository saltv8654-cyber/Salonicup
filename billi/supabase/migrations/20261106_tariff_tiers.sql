-- billi: tiered prices (e.g. 0–150 kWh at one price, above at another) and tiered fixed fees.
-- Run after 20261104_energy_data.sql. Safe to run more than once.
alter table tariffs add column if not exists price_tiers jsonb;  -- [{"upto": 150, "price": 0.139}, {"upto": null, "price": 0.219}], monthly kWh
alter table tariffs add column if not exists fee_tiers   jsonb;  -- [{"upto": 150, "fee": 7.95}, {"upto": null, "fee": 15.90}]
alter table tariffs add column if not exists tier_mode   text;   -- from_first: whole month at the tier reached; excess: each tier for its own kWh
do $$ begin
  alter table tariffs add constraint tariffs_tier_mode_check check (tier_mode in ('from_first', 'excess'));
exception when duplicate_object then null; end $$;

-- Price history also records tier changes.
create or replace function billi_tariff_history() returns trigger language plpgsql as $$
declare
  r    tariffs;
  kind text;
begin
  if tg_op = 'DELETE' then
    r := old; kind := 'deleted';
  elsif tg_op = 'INSERT' then
    r := new; kind := 'created';
  else
    r := new;
    if old.active and not new.active then kind := 'deactivated';
    elsif not old.active and new.active then kind := 'reactivated';
    elsif (old.provider, old.name, old.color, old.fixed_monthly_eur, old.price_per_kwh_eur, old.price_per_kwh_with_discount_eur,
           old.price_per_kwh_night_eur, old.day_night, old.discount_condition, old.promo_discount, old.min_duration_months,
           old.early_termination_fee, old.conditions, old.valid_month, old.valid_from, old.valid_until, old.segment, old.price_tiers, old.fee_tiers, old.tier_mode)
          is distinct from
          (new.provider, new.name, new.color, new.fixed_monthly_eur, new.price_per_kwh_eur, new.price_per_kwh_with_discount_eur,
           new.price_per_kwh_night_eur, new.day_night, new.discount_condition, new.promo_discount, new.min_duration_months,
           new.early_termination_fee, new.conditions, new.valid_month, new.valid_from, new.valid_until, new.segment, new.price_tiers, new.fee_tiers, new.tier_mode)
      then kind := 'updated';
    else
      return null; -- only bookkeeping columns changed (updated_at, last_verified_at …)
    end if;
  end if;
  insert into tariff_price_history (tariff_id, change, provider, name, color, fixed_monthly_eur, price_per_kwh_eur,
    price_per_kwh_with_discount_eur, price_per_kwh_night_eur, valid_month, valid_from, valid_until, active, snapshot, changed_by, source_url)
  values (r.id, kind, r.provider, r.name, r.color, r.fixed_monthly_eur, r.price_per_kwh_eur,
    r.price_per_kwh_with_discount_eur, r.price_per_kwh_night_eur, r.valid_month, r.valid_from, r.valid_until, r.active,
    to_jsonb(r), coalesce(r.updated_by, 'system'), r.url);
  return null;
end $$;

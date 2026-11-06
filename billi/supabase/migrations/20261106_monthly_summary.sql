-- billi: monthly summary notifications for users with an account. Safe to run more than once.
alter table user_alerts drop constraint if exists user_alerts_kind_check;
alter table user_alerts add constraint user_alerts_kind_check check (kind in (
  'cheaper_program', 'provider_increase', 'provider_better_offer', 'contract_expiring', 'overpaying', 'monthly_summary'));

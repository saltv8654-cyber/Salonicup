-- Πρόγραμμα εβδομάδας ανά πρωτάθλημα, κάθε Πέμπτη. Ασφαλές να ξανατρέξει.

-- Νέα αυτόματη εργασία.
alter table social_schedules drop constraint if exists social_schedules_workflow_check;
alter table social_schedules add constraint social_schedules_workflow_check
  check (workflow in ('daily_check','weekly_strategy','monthly_report','weekly_program'));
alter table social_schedules add column if not exists options jsonb not null default '{}'::jsonb;

-- Πέμπτη (4) στις 12:00, για την εβδομάδα που ξεκινά την επόμενη Δευτέρα. Ανενεργό μέχρι να το ανοίξεις.
insert into social_schedules (workflow, hour_local, weekday, options)
values ('weekly_program', 12, 4, '{"week": "next", "platforms": ["instagram", "facebook"]}')
on conflict (workflow) do nothing;

-- Ένα post ανά πρωτάθλημα και εβδομάδα, όσες φορές κι αν τρέξει η εργασία.
alter table social_content add column if not exists source_key text;
create unique index if not exists social_content_source_key_idx on social_content(source_key) where source_key is not null;

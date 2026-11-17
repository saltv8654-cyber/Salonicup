-- Βαθμολογία ανά πρωτάθλημα, κάθε Δευτέρα (post + story). Ασφαλές να ξανατρέξει.
alter table social_schedules drop constraint if exists social_schedules_workflow_check;
alter table social_schedules add constraint social_schedules_workflow_check
  check (workflow in ('daily_check','weekly_strategy','monthly_report','weekly_program','weekly_standings'));

-- Δευτέρα (1) στις 12:00. Ανενεργό μέχρι να το ανοίξεις.
insert into social_schedules (workflow, hour_local, weekday, options)
values ('weekly_standings', 12, 1, '{"platforms": ["instagram", "facebook"]}')
on conflict (workflow) do nothing;

-- billi CRM: tasks and reminders per customer. Safe to run more than once.
create table if not exists lead_tasks (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text,
  title      text not null,
  due_at     timestamptz not null,
  done_at    timestamptz,
  done_by    text
);
create index if not exists lead_tasks_open_idx on lead_tasks (done_at, due_at);
create index if not exists lead_tasks_lead_idx on lead_tasks (lead_id, due_at);
alter table lead_tasks enable row level security;

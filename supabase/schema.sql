-- ============================================================================
-- ProjectMgt — Supabase schema
-- ----------------------------------------------------------------------------
-- Run once in Supabase → SQL Editor → New query → Run.
-- Every table is prefixed pm_ so this coexists safely with TaskMgt's tables
-- in the SAME Supabase project. Nothing here touches TaskMgt.
-- ============================================================================

create extension if not exists pgcrypto;

-- Projects (each has its own chart, groups, owners, and notes)
create table if not exists pm_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#AEDFF7',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Workstreams / groupings within a project (rows on the chart)
create table if not exists pm_groups (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references pm_projects(id) on delete cascade,
  name        text not null,
  color       text not null,
  sort_order  integer not null default 0
);

-- Owners (who is responsible; also a chart pivot)
create table if not exists pm_owners (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references pm_projects(id) on delete cascade,
  name        text not null,
  color       text not null,
  sort_order  integer not null default 0
);

-- Tasks (bars and milestones)
create table if not exists pm_tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references pm_projects(id) on delete cascade,
  group_id     uuid not null references pm_groups(id) on delete restrict,
  owner_id     uuid references pm_owners(id) on delete set null,
  parent_id    uuid references pm_tasks(id) on delete set null, -- subtask of…
  title        text not null,
  notes        text,
  callout      text,                       -- annotation shown on the chart
  start_date   date not null,
  end_date     date,                       -- null = single day
  is_milestone boolean not null default false,
  at_risk      boolean not null default false,
  pinned       boolean not null default false, -- shows on the Master timeline
  is_complete  boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pm_end_after_start check (end_date is null or end_date >= start_date)
);

-- Dependencies: task_id depends on depends_on_id (finish-to-start, informational)
create table if not exists pm_dependencies (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references pm_projects(id) on delete cascade,
  task_id        uuid not null references pm_tasks(id) on delete cascade,
  depends_on_id  uuid not null references pm_tasks(id) on delete cascade,
  unique (task_id, depends_on_id)
);

-- Notes (project-scoped; same feature set as TaskMgt's notes)
create table if not exists pm_notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references pm_projects(id) on delete cascade,
  title       text,
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists pm_note_tags (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references pm_projects(id) on delete cascade,
  name           text not null,
  color          text not null,
  sort_order     integer not null default 0,
  show_in_recap  boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists pm_snippet_completions (
  id             uuid primary key default gen_random_uuid(),
  note_id        uuid not null references pm_notes(id) on delete cascade,
  tag            text not null,
  snippet_hash   text not null,
  completed_at   timestamptz not null default now(),
  unique (note_id, tag, snippet_hash)
);

-- Link between a tagged note snippet and a chart task it spawned
create table if not exists pm_note_links (
  id             uuid primary key default gen_random_uuid(),
  note_id        uuid not null references pm_notes(id) on delete cascade,
  tag            text not null,
  snippet_hash   text not null,
  task_id        uuid not null references pm_tasks(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (note_id, tag, snippet_hash)
);

-- updated_at triggers
create or replace function pm_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pm_tasks_updated on pm_tasks;
create trigger pm_tasks_updated before update on pm_tasks
  for each row execute function pm_set_updated_at();

drop trigger if exists pm_notes_updated on pm_notes;
create trigger pm_notes_updated before update on pm_notes
  for each row execute function pm_set_updated_at();

-- completed_at sync
create or replace function pm_sync_completed_at()
returns trigger as $$
begin
  if new.is_complete and not old.is_complete then
    new.completed_at = now();
  elsif not new.is_complete and old.is_complete then
    new.completed_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists pm_tasks_completed on pm_tasks;
create trigger pm_tasks_completed before update on pm_tasks
  for each row execute function pm_sync_completed_at();

-- Indexes
create index if not exists idx_pm_groups_project on pm_groups(project_id);
create index if not exists idx_pm_owners_project on pm_owners(project_id);
create index if not exists idx_pm_tasks_project on pm_tasks(project_id);
create index if not exists idx_pm_tasks_pinned on pm_tasks(pinned) where pinned = true;
create index if not exists idx_pm_deps_project on pm_dependencies(project_id);
create index if not exists idx_pm_notes_project on pm_notes(project_id);
create index if not exists idx_pm_links_task on pm_note_links(task_id);

-- RLS: no-login shared-by-link app, permissive anon policies
alter table pm_projects            enable row level security;
alter table pm_groups              enable row level security;
alter table pm_owners              enable row level security;
alter table pm_tasks               enable row level security;
alter table pm_dependencies        enable row level security;
alter table pm_notes               enable row level security;
alter table pm_note_tags           enable row level security;
alter table pm_snippet_completions enable row level security;
alter table pm_note_links          enable row level security;

drop policy if exists "public all" on pm_projects;
create policy "public all" on pm_projects for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_groups;
create policy "public all" on pm_groups for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_owners;
create policy "public all" on pm_owners for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_tasks;
create policy "public all" on pm_tasks for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_dependencies;
create policy "public all" on pm_dependencies for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_notes;
create policy "public all" on pm_notes for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_note_tags;
create policy "public all" on pm_note_tags for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_snippet_completions;
create policy "public all" on pm_snippet_completions for all to anon, authenticated using (true) with check (true);
drop policy if exists "public all" on pm_note_links;
create policy "public all" on pm_note_links for all to anon, authenticated using (true) with check (true);

-- Seed a starter project so the app opens onto something
insert into pm_projects (name, color, sort_order)
select 'My First Project', '#AEDFF7', 1
where not exists (select 1 from pm_projects);

-- Done.

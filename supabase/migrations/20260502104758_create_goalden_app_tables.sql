create table public.goalden_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goalden_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_site_ids text[] not null default array['reddit', 'youtube', 'tiktok', 'instagram'],
  break_minutes integer not null default 15 check (break_minutes >= 1 and break_minutes <= 60),
  active_task_id text,
  unlocks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goalden_tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source text not null default 'Manual',
  deadline text not null default 'No deadline',
  next_step text not null default 'Finish one small piece',
  status text not null default 'open' check (status in ('open', 'done', 'paused')),
  created_at_bigint bigint not null,
  updated_at_bigint bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table public.goalden_progress_logs (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id text not null check (site_id in ('reddit', 'youtube', 'tiktok', 'instagram')),
  task_id text,
  task_title text,
  text text not null,
  created_at_bigint bigint not null,
  unlock_until_bigint bigint not null,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

create index goalden_tasks_user_updated_idx
  on public.goalden_tasks (user_id, updated_at_bigint desc);

create index goalden_progress_user_created_idx
  on public.goalden_progress_logs (user_id, created_at_bigint desc);

create or replace function public.set_goalden_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_goalden_profiles_updated_at
before update on public.goalden_profiles
for each row execute function public.set_goalden_updated_at();

create trigger set_goalden_settings_updated_at
before update on public.goalden_settings
for each row execute function public.set_goalden_updated_at();

create trigger set_goalden_tasks_updated_at
before update on public.goalden_tasks
for each row execute function public.set_goalden_updated_at();

alter table public.goalden_profiles enable row level security;
alter table public.goalden_settings enable row level security;
alter table public.goalden_tasks enable row level security;
alter table public.goalden_progress_logs enable row level security;

create policy "Users can read their Goalden profile"
on public.goalden_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their Goalden profile"
on public.goalden_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their Goalden profile"
on public.goalden_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read their Goalden settings"
on public.goalden_settings
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their Goalden settings"
on public.goalden_settings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their Goalden settings"
on public.goalden_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read their Goalden tasks"
on public.goalden_tasks
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their Goalden tasks"
on public.goalden_tasks
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their Goalden tasks"
on public.goalden_tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their Goalden tasks"
on public.goalden_tasks
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can read their Goalden progress logs"
on public.goalden_progress_logs
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their Goalden progress logs"
on public.goalden_progress_logs
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete their Goalden progress logs"
on public.goalden_progress_logs
for delete
to authenticated
using (auth.uid() = user_id);

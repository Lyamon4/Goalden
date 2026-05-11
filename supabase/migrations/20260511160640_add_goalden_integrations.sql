create extension if not exists pgcrypto;

alter table public.goalden_tasks
add column if not exists source_provider text check (source_provider in ('telegram', 'slack')),
add column if not exists source_external_id text,
add column if not exists evidence_snippet text,
add column if not exists confidence numeric check (confidence >= 0 and confidence <= 1);

create table public.goalden_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('telegram', 'slack')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected', 'error')),
  display_name text,
  external_account_id text,
  last_synced_at_bigint bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.goalden_integration_secrets (
  integration_id uuid primary key references public.goalden_integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('telegram', 'slack')),
  access_token text,
  refresh_token text,
  token_expires_at_bigint bigint,
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goalden_task_candidates (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid references public.goalden_integrations(id) on delete set null,
  provider text not null check (provider in ('telegram', 'slack')),
  source_external_id text,
  title text not null,
  deadline text not null default 'No deadline',
  next_step text not null default 'Finish one small piece',
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  evidence_snippet text not null default '',
  status text not null default 'new' check (status in ('new', 'accepted', 'dismissed')),
  created_at_bigint bigint not null,
  updated_at_bigint bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create index goalden_integrations_user_provider_idx
  on public.goalden_integrations (user_id, provider);

create index goalden_candidates_user_status_idx
  on public.goalden_task_candidates (user_id, status, updated_at_bigint desc);

create index goalden_candidates_user_provider_external_idx
  on public.goalden_task_candidates (user_id, provider, source_external_id);

create trigger set_goalden_integrations_updated_at
before update on public.goalden_integrations
for each row execute function public.set_goalden_updated_at();

create trigger set_goalden_integration_secrets_updated_at
before update on public.goalden_integration_secrets
for each row execute function public.set_goalden_updated_at();

create trigger set_goalden_task_candidates_updated_at
before update on public.goalden_task_candidates
for each row execute function public.set_goalden_updated_at();

alter table public.goalden_integrations enable row level security;
alter table public.goalden_integration_secrets enable row level security;
alter table public.goalden_task_candidates enable row level security;

create policy "Users can read their Goalden integrations"
on public.goalden_integrations
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their Goalden integrations"
on public.goalden_integrations
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their Goalden integrations"
on public.goalden_integrations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read their Goalden task candidates"
on public.goalden_task_candidates
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their Goalden task candidates"
on public.goalden_task_candidates
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their Goalden task candidates"
on public.goalden_task_candidates
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their Goalden task candidates"
on public.goalden_task_candidates
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.goalden_integrations to authenticated;
grant select, insert, update, delete on public.goalden_task_candidates to authenticated;
revoke all on public.goalden_integration_secrets from anon, authenticated;

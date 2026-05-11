alter table public.goalden_tasks
drop constraint if exists goalden_tasks_source_provider_check;

alter table public.goalden_tasks
add constraint goalden_tasks_source_provider_check
check (source_provider in ('telegram', 'slack', 'browser'));

alter table public.goalden_task_candidates
drop constraint if exists goalden_task_candidates_provider_check;

alter table public.goalden_task_candidates
add constraint goalden_task_candidates_provider_check
check (provider in ('telegram', 'slack', 'browser'));

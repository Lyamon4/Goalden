alter table public.goalden_settings
add column if not exists ai_settings jsonb not null default jsonb_build_object(
  'enabled', true,
  'model', 'openai/gpt-oss-120b',
  'sitePickingEnabled', true
);

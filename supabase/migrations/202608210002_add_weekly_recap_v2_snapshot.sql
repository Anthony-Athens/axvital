alter table public.weekly_recaps
  add column if not exists analysis_version text not null default 'v1',
  add column if not exists data_completeness jsonb not null default '{}',
  add column if not exists summary_metrics jsonb not null default '[]',
  add column if not exists wins jsonb not null default '[]',
  add column if not exists changes jsonb not null default '[]',
  add column if not exists patterns jsonb not null default '[]',
  add column if not exists symptom_summary jsonb not null default '[]',
  add column if not exists experiment_summary jsonb not null default '[]',
  add column if not exists next_week_focus jsonb;

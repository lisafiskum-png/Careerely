-- Behavioral signals (preference precedence layer 2).
--
-- POST_LAUNCH.md: "the behavioral signal table should exist but not be
-- populated in V1". V1 ranks on explicit onboarding preferences only; nothing
-- reads or writes this table until behavioral learning ships.

create table if not exists public.behavioral_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- e.g. opened, dismissed, applied. Free text so post-launch work needs no migration.
  kind text not null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists behavioral_signals_user_created_idx on public.behavioral_signals (user_id, created_at desc);

alter table public.behavioral_signals enable row level security;

revoke insert, update, delete on public.behavioral_signals from anon, authenticated;
grant select on public.behavioral_signals to authenticated;

drop policy if exists behavioral_signals_select_own on public.behavioral_signals;
create policy behavioral_signals_select_own on public.behavioral_signals
  for select to authenticated using (user_id = auth.uid());

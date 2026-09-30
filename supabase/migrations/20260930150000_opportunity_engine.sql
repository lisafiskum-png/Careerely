-- Opportunity Engine V1 (Phase C).
--
-- Aligns the Phase A tables with OPPORTUNITY_ENGINE_SCHEMA.ts (locked rules):
--   * EvidenceOutcome is confirmed | inferred | unknown — never negative.
--   * Evidence records carry signal type, source type and the verbatim source text.
--   * Opportunities store requirement evaluations, score dimensions, goal
--     alignment, the two primary evidence points and the preparation decision.
--   * Rejections use the schema's RejectionReason values.
--   * Application packages store the resume delta, cover letter segments and
--     the generating model.
-- Adds the engine's work queue and the preparation quota reservation.
--
-- The Phase A engine tables have never been written to by the app, so the
-- replaced evidence columns are dropped rather than kept.

-- ─────────────────────────────────────────────────────────────────────────────
-- Evidence
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type public.evidence_outcome as enum ('confirmed', 'inferred', 'unknown');
exception when duplicate_object then null; end $$;

alter table public.evidence add column if not exists job_id uuid references public.jobs (id) on delete cascade;
alter table public.evidence add column if not exists signal_type text;
alter table public.evidence add column if not exists source_type text;
alter table public.evidence add column if not exists source_text text;
alter table public.evidence add column if not exists outcome public.evidence_outcome not null default 'unknown';
alter table public.evidence add column if not exists confidence numeric(3, 2) not null default 0;

alter table public.evidence drop column if exists verdict;
alter table public.evidence drop column if exists job_quote;
alter table public.evidence drop column if exists resume_quote;
alter table public.evidence drop column if exists inferred;
alter table public.evidence drop column if exists requirement;
alter table public.evidence drop column if exists kind;
drop type if exists public.evidence_verdict;

alter table public.evidence alter column signal_type set not null;
alter table public.evidence alter column source_type set not null;
alter table public.evidence alter column source_text set not null;

alter table public.evidence drop constraint if exists evidence_signal_type_check;
alter table public.evidence add constraint evidence_signal_type_check check (signal_type in (
  'skills_keyword_match', 'experience_duration', 'seniority_inference', 'industry_experience',
  'location_compatibility', 'compensation_compatibility', 'goal_alignment',
  'requirement_met', 'requirement_partial', 'requirement_unverifiable'));
alter table public.evidence drop constraint if exists evidence_source_type_check;
alter table public.evidence add constraint evidence_source_type_check check (source_type in (
  'resume_text', 'job_description', 'user_preference', 'agent_inference'));
alter table public.evidence drop constraint if exists evidence_confidence_check;
alter table public.evidence add constraint evidence_confidence_check check (confidence >= 0 and confidence <= 1);
-- Agent judgment is never a confirmed fact.
alter table public.evidence drop constraint if exists evidence_inference_not_confirmed;
alter table public.evidence add constraint evidence_inference_not_confirmed check (
  not (source_type = 'agent_inference' and outcome = 'confirmed'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Jobs (ingested from company job boards)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.jobs add column if not exists is_active boolean not null default true;
alter table public.jobs add column if not exists company_slug text;
alter table public.jobs add column if not exists company_domain text;
alter table public.jobs add column if not exists requirements text[] not null default '{}';
alter table public.jobs add column if not exists dedupe_key text;

create index if not exists jobs_active_seen_idx on public.jobs (is_active, first_seen_at desc);
create index if not exists jobs_dedupe_idx on public.jobs (dedupe_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- Opportunities
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.opportunities add column if not exists matched_target_role text;
alter table public.opportunities add column if not exists industry_match boolean;
alter table public.opportunities add column if not exists alignment_score numeric(3, 2);
alter table public.opportunities add column if not exists goal_reasoning text;
alter table public.opportunities add column if not exists goal_evidence_ids uuid[] not null default '{}';
alter table public.opportunities add column if not exists requirement_evaluations jsonb not null default '[]'::jsonb;
alter table public.opportunities add column if not exists reasoning_evidence_ids uuid[] not null default '{}';
alter table public.opportunities add column if not exists primary_evidence_ids uuid[] not null default '{}';
alter table public.opportunities add column if not exists preparation_decision jsonb;
alter table public.opportunities add column if not exists shortlisted_at timestamptz not null default now();
alter table public.opportunities add column if not exists preparing_started_at timestamptz;
alter table public.opportunities add column if not exists ready_at timestamptz;

-- MatchScore: 0–100 whole number.
alter table public.opportunities drop constraint if exists opportunities_match_score_whole;
alter table public.opportunities add constraint opportunities_match_score_whole check (
  match_score is null or match_score = round(match_score));
-- LOCKED: only two evidence points on the pick card.
alter table public.opportunities drop constraint if exists opportunities_primary_evidence_max2;
alter table public.opportunities add constraint opportunities_primary_evidence_max2 check (
  cardinality(primary_evidence_ids) <= 2);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rejections — logged, never silently dropped
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.rejections add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.rejections drop constraint if exists rejections_reason_code_check;
alter table public.rejections add constraint rejections_reason_code_check check (reason_code in (
  'failed_hard_filter', 'score_below_threshold', 'goal_misalignment', 'dismissed_by_user', 'quota_not_selected'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Application packages (Stage 7)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.application_packages add column if not exists generation_model text;
alter table public.application_packages add column if not exists tailored_resume_text text;
alter table public.application_packages add column if not exists has_changes boolean;
alter table public.application_packages add column if not exists attempts integer not null default 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Scan runs
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.search_runs add column if not exists jobs_prepared integer not null default 0;
alter table public.search_runs add column if not exists jobs_deferred integer not null default 0;
alter table public.search_runs add column if not exists new_opportunity_ids uuid[] not null default '{}';
alter table public.search_runs add column if not exists prepared_opportunity_ids uuid[] not null default '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- Work queue (nightly scans are batched across short function invocations)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.engine_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('nightly', 'sync_source', 'scan_search', 'decide_preparation', 'prepare_package')),
  -- Makes enqueueing idempotent, e.g. 'scan:<search id>:2026-10-01'.
  dedupe_key text unique,
  user_id uuid references auth.users (id) on delete cascade,
  search_id uuid references public.searches (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists engine_tasks_ready_idx on public.engine_tasks (status, run_after);

drop trigger if exists engine_tasks_set_updated_at on public.engine_tasks;
create trigger engine_tasks_set_updated_at
  before update on public.engine_tasks
  for each row execute function public.set_updated_at();

alter table public.engine_tasks enable row level security;
revoke all on public.engine_tasks from anon, authenticated;

-- Claims up to p_limit runnable tasks with a lease. Expired leases (a worker
-- that died mid-task) become claimable again; attempts are capped.
create or replace function public.claim_engine_tasks(p_limit integer, p_lease_seconds integer)
returns setof public.engine_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Tasks whose lease expired after their final attempt are failed, not retried.
  update public.engine_tasks
  set status = 'failed', last_error = coalesce(last_error, 'lease expired')
  where status = 'running' and locked_until < now() and attempts >= max_attempts;

  return query
  update public.engine_tasks t
  set status = 'running',
      attempts = t.attempts + 1,
      locked_until = now() + make_interval(secs => p_lease_seconds)
  where t.id in (
    select id from public.engine_tasks
    where (status = 'queued' and run_after <= now())
       or (status = 'running' and locked_until < now() and attempts < max_attempts)
    order by run_after, created_at
    limit p_limit
    for update skip locked
  )
  returning t.*;
end;
$$;

-- Candidates selected for AI evaluation in a scan run (Stages 2–5), evaluated in
-- small batches across task invocations, then ranked together (Stages 3–4).
create table if not exists public.candidate_evaluations (
  run_id uuid not null references public.search_runs (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'evaluated', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  primary key (run_id, job_id)
);

alter table public.candidate_evaluations enable row level security;
revoke all on public.candidate_evaluations from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Preparation quota reservation (Stage 6)
-- ─────────────────────────────────────────────────────────────────────────────

-- Reserves preparation slots for the given opportunities, in order, within the
-- plan's monthly allowance and at most p_max per call. Automatic preparation
-- counts toward the allowance (launch decision #1). Serialised per user so two
-- workers can never overspend. Returns the opportunity ids that were reserved.
create or replace function public.reserve_preparations(p_user uuid, p_opportunity_ids uuid[], p_max integer)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  lim integer;
  used integer;
  remaining integer;
  reserved uuid[] := '{}';
  opp uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 42));

  select s.plan, s.current_period_start into sub
  from public.subscriptions s
  where s.user_id = p_user and public.has_active_access(p_user);
  if sub.plan is null then
    return reserved;
  end if;

  select l.monthly_preparations into lim from public.plan_limits(sub.plan) l;
  used := public.preparations_used(p_user);
  remaining := least(greatest(lim - used, 0), greatest(p_max, 0));

  foreach opp in array p_opportunity_ids loop
    exit when remaining <= 0;
    if exists (
      select 1 from public.opportunities o
      where o.id = opp and o.user_id = p_user and o.state = 'shortlisted' and o.dismissed_at is null
    ) and not exists (
      select 1 from public.application_packages p where p.opportunity_id = opp and p.status <> 'failed'
    ) then
      delete from public.application_packages where opportunity_id = opp and status = 'failed';
      insert into public.application_packages (user_id, opportunity_id, status, quota_period_start)
      values (p_user, opp, 'preparing', sub.current_period_start);
      update public.opportunities
      set state = 'preparing', preparing_started_at = now()
      where id = opp;
      reserved := reserved || opp;
      remaining := remaining - 1;
    end if;
  end loop;

  return reserved;
end;
$$;

revoke all on function public.claim_engine_tasks(integer, integer) from public;
revoke all on function public.reserve_preparations(uuid, uuid[], integer) from public;
grant execute on function public.claim_engine_tasks(integer, integer) to service_role;
grant execute on function public.reserve_preparations(uuid, uuid[], integer) to service_role;

-- Atomic counter update when a package becomes Ready (packages finish concurrently).
create or replace function public.record_prepared(p_run uuid, p_opportunity uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.search_runs
  set jobs_prepared = jobs_prepared + 1,
      prepared_opportunity_ids = array_append(prepared_opportunity_ids, p_opportunity)
  where id = p_run and not (p_opportunity = any (prepared_opportunity_ids));
$$;

revoke all on function public.record_prepared(uuid, uuid) from public;
grant execute on function public.record_prepared(uuid, uuid) to service_role;

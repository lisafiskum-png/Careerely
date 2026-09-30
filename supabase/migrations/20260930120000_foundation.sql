-- Careerely foundation schema (Phase A).
--
-- Source of truth: the Careerely Master Brief. This migration defines the data
-- model for onboarding, searches, the Opportunity Engine, application packages,
-- applications and billing. Engine internals (requirement evaluations, composite
-- scores, ranking factors, resume changes, cover letter segments) are stored as
-- jsonb so the locked TypeScript schema can be mapped onto them in Phase C
-- without further migrations.
--
-- Security model:
--   * Every user-owned table has row level security enabled.
--   * Users can read their own rows. Writes are limited to the few things a user
--     directly controls (profile names, career profile, searches, dismissals,
--     application status). Everything the engine produces is written only by the
--     service role, which bypasses RLS.
--   * Billing state (plan, status, period) lives in `subscriptions` and can only
--     be written by the service role, i.e. by the Stripe webhook.
--   * Accounts without an active subscription are read-only (Master Brief +
--     launch decision #2): the has_active_access() check blocks user writes.
--
-- This migration is safe to run against the legacy database: it never drops a
-- table, column or row. Legacy tables (cover_letters, dream_companies) and
-- legacy profile columns (plan, voice_sample, digest_enabled, radar_enabled)
-- keep their data but are no longer read by the app, and signed-in users lose
-- write access to them (see the grants section). See supabase/README.md.


-- ─────────────────────────────────────────────────────────────────────────────
-- Enumerations
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type public.plan_id as enum ('basic', 'pro', 'max');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_style as enum ('on_site', 'hybrid', 'remote');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.search_status as enum ('active', 'paused');
exception when duplicate_object then null; end $$;

-- Master Brief: Shortlisted (no preparation) / Preparing / Ready.
do $$ begin
  create type public.opportunity_state as enum ('shortlisted', 'preparing', 'ready');
exception when duplicate_object then null; end $$;

-- "Not for me" quick reasons: Role · Company · Location · Salary · Industry · Other.
do $$ begin
  create type public.dismiss_reason as enum ('role', 'company', 'location', 'salary', 'industry', 'other');
exception when duplicate_object then null; end $$;

-- Three-state signal rule: missing evidence is "unknown", never "negative".
do $$ begin
  create type public.evidence_verdict as enum ('met', 'not_met', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.package_status as enum ('preparing', 'ready', 'failed');
exception when duplicate_object then null; end $$;

-- Master Brief: four core statuses. No "No response" status.
do $$ begin
  create type public.application_status as enum ('ready_to_apply', 'applied', 'interview', 'offer');
exception when duplicate_object then null; end $$;

-- Closed outcomes, not pipeline stages.
do $$ begin
  create type public.application_outcome as enum ('declined', 'withdrawn');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared helpers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Profiles (one row per auth user, created by trigger on signup)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Legacy profiles tables may lack the cascade to auth.users. NOT VALID adds the
-- cascade for future deletes without failing on (or deleting) existing rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'f'
      and confrelid = 'auth.users'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade not valid;
  end if;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts created before this trigger existed.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Subscriptions (written only by the Stripe webhook via the service role)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan public.plan_id,
  -- Stripe subscription status, stored verbatim (active, past_due, canceled, ...).
  status text not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Processed Stripe event ids, for webhook idempotency.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- Plan limits. Mirrors lib/plans.ts (a test keeps the two in sync).
-- null active_searches = unlimited.
create or replace function public.plan_limits(p public.plan_id)
returns table (active_searches integer, monthly_preparations integer)
language sql
immutable
as $$
  select case p when 'basic' then 1 when 'pro' then 5 when 'max' then null end,
         case p when 'basic' then 10 when 'pro' then 50 when 'max' then 200 end;
$$;

-- Full access: the subscription is paid up, or cancelled but still inside the
-- period the user already paid for. Everything else is read-only.
-- past_due keeps access while Stripe retries the payment; Stripe then moves the
-- subscription to canceled/unpaid according to the account's retry settings.
create or replace function public.has_active_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and s.plan is not null
      and s.current_period_end is not null
      and s.current_period_end > now()
      and s.status in ('active', 'trialing', 'past_due', 'canceled')
  );
$$;

create or replace function public.current_plan(uid uuid)
returns public.plan_id
language sql
stable
security definer
set search_path = public
as $$
  select s.plan from public.subscriptions s
  where s.user_id = uid and public.has_active_access(uid);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Career profile (onboarding step 2 + step 3 output)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.career_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  resume_file_path text,
  resume_text text,
  -- Structured resume returned by Claude and corrected by the user.
  resume_data jsonb,
  target_roles text[] not null default '{}',
  industries text[] not null default '{}',
  work_styles public.work_style[] not null default '{}',
  locations text[] not null default '{}',
  min_compensation integer check (min_compensation is null or min_compensation >= 0),
  compensation_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_profiles_roles_max check (cardinality(target_roles) <= 3),
  constraint career_profiles_industries_max check (cardinality(industries) <= 5)
);

drop trigger if exists career_profiles_set_updated_at on public.career_profiles;
create trigger career_profiles_set_updated_at
  before update on public.career_profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Searches ("What is Careerely hunting for on my behalf?")
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  status public.search_status not null default 'active',
  target_roles text[] not null default '{}',
  industries text[] not null default '{}',
  work_styles public.work_style[] not null default '{}',
  locations text[] not null default '{}',
  -- Inherits from the career profile when null.
  min_compensation integer check (min_compensation is null or min_compensation >= 0),
  created_from_profile boolean not null default false,
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists searches_user_id_idx on public.searches (user_id);

drop trigger if exists searches_set_updated_at on public.searches;
create trigger searches_set_updated_at
  before update on public.searches
  for each row execute function public.set_updated_at();

-- Active-search limit per plan. Never silently pause: the insert/update fails and
-- the UI offers "Save as paused" (Master Brief, Searches page).
create or replace function public.enforce_active_search_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.plan_id;
  lim integer;
  active_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  plan := public.current_plan(new.user_id);
  if plan is null then
    raise exception 'An active subscription is required to run searches'
      using errcode = 'P0001', hint = 'subscription_required';
  end if;

  select l.active_searches into lim from public.plan_limits(plan) l;
  if lim is null then
    return new;
  end if;

  select count(*) into active_count
  from public.searches s
  where s.user_id = new.user_id and s.status = 'active' and s.id <> new.id;

  if active_count >= lim then
    raise exception 'Active search limit reached for this plan'
      using errcode = 'P0001', hint = 'active_search_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists searches_enforce_active_limit on public.searches;
create trigger searches_enforce_active_limit
  before insert or update of status on public.searches
  for each row execute function public.enforce_active_search_limit();

-- ─────────────────────────────────────────────────────────────────────────────
-- Jobs (shared across users; written only by the engine)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_job_id text not null,
  url text not null,
  title text not null,
  company text,
  location text,
  work_style public.work_style,
  description text,
  salary_min integer,
  salary_max integer,
  salary_currency text,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  content_hash text,
  unique (source, source_job_id)
);

create index if not exists jobs_last_seen_idx on public.jobs (last_seen_at desc);

-- One row per engine run for a search. Backs "Reviewed N postings" style
-- numbers with stored data.
create table if not exists public.search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  search_id uuid not null references public.searches (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  jobs_reviewed integer not null default 0,
  jobs_rejected integer not null default 0,
  jobs_shortlisted integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists search_runs_user_started_idx on public.search_runs (user_id, started_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Opportunities, evidence and rejections
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  search_id uuid references public.searches (id) on delete set null,
  run_id uuid references public.search_runs (id) on delete set null,
  state public.opportunity_state not null default 'shortlisted',
  is_my_pick boolean not null default false,
  rank integer,
  match_score numeric(5, 2) check (match_score is null or (match_score >= 0 and match_score <= 100)),
  goal_aligned boolean,
  -- Composite / multi-dimensional scores and ranking factors (engine schema).
  scores jsonb not null default '{}'::jsonb,
  ranking_factors jsonb not null default '[]'::jsonb,
  reasoning text,
  dismissed_at timestamptz,
  dismiss_reason public.dismiss_reason,
  dismiss_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists opportunities_user_state_idx on public.opportunities (user_id, state) where dismissed_at is null;
-- At most one live My Pick per user.
create unique index if not exists opportunities_one_my_pick_idx
  on public.opportunities (user_id) where is_my_pick and dismissed_at is null;

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- Every UI claim must trace to one of these rows.
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  kind text not null,
  requirement text,
  verdict public.evidence_verdict not null default 'unknown',
  claim text not null,
  -- Inferred claims are judgment, not fact.
  inferred boolean not null default false,
  job_quote text,
  resume_quote text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists evidence_opportunity_idx on public.evidence (opportunity_id);

-- Rejected opportunities are logged, never silently dropped.
create table if not exists public.rejections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  search_id uuid references public.searches (id) on delete set null,
  run_id uuid references public.search_runs (id) on delete set null,
  stage smallint not null check (stage between 1 and 7),
  reason_code text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists rejections_user_created_idx on public.rejections (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Application packages (tailored resume + cover letter) and applications
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.application_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null unique references public.opportunities (id) on delete cascade,
  status public.package_status not null default 'preparing',
  -- "What Careerely changed": structured list of resume changes.
  resume_changes jsonb not null default '[]'::jsonb,
  tailored_resume jsonb,
  cover_letter_segments jsonb not null default '[]'::jsonb,
  cover_letter_text text,
  resume_pdf_path text,
  cover_letter_pdf_path text,
  error text,
  -- Start of the billing period this preparation was counted against.
  quota_period_start timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists application_packages_user_created_idx on public.application_packages (user_id, created_at desc);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  package_id uuid references public.application_packages (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  status public.application_status not null default 'ready_to_apply',
  outcome public.application_outcome,
  applied_at timestamptz,
  status_updated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create index if not exists applications_user_status_idx on public.applications (user_id, status);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Preparations counted against the current billing period. Failed packages do
-- not count. Automatic preparation counts (launch decision #1).
create or replace function public.preparations_used(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.application_packages p
  join public.subscriptions s on s.user_id = p.user_id
  where p.user_id = uid
    and p.status <> 'failed'
    and s.current_period_start is not null
    and p.quota_period_start = s.current_period_start;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recent activity log (dashboard)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  application_id uuid references public.applications (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_user_created_idx on public.activity (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove any policies left over from the prototype so only the policies below
-- apply. Policies hold no data, so this is safe to run.
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'subscriptions', 'stripe_events', 'career_profiles', 'searches',
                        'jobs', 'search_runs', 'opportunities', 'evidence', 'rejections',
                        'application_packages', 'applications', 'activity')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.career_profiles enable row level security;
alter table public.searches enable row level security;
alter table public.jobs enable row level security;
alter table public.search_runs enable row level security;
alter table public.opportunities enable row level security;
alter table public.evidence enable row level security;
alter table public.rejections enable row level security;
alter table public.application_packages enable row level security;
alter table public.applications enable row level security;
alter table public.activity enable row level security;

-- Column-level write privileges: RLS decides which rows, grants decide which
-- columns. Users can never write plan/billing, engine output or timestamps.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke all on public.stripe_events from anon, authenticated;

grant update (first_name, last_name, onboarding_completed_at) on public.profiles to authenticated;
grant insert (user_id, resume_file_path, resume_text, resume_data, target_roles, industries, work_styles, locations, min_compensation, compensation_currency)
  on public.career_profiles to authenticated;
grant update (resume_file_path, resume_text, resume_data, target_roles, industries, work_styles, locations, min_compensation, compensation_currency)
  on public.career_profiles to authenticated;
grant insert (user_id, name, status, target_roles, industries, work_styles, locations, min_compensation, created_from_profile)
  on public.searches to authenticated;
grant update (name, status, target_roles, industries, work_styles, locations, min_compensation)
  on public.searches to authenticated;
grant delete on public.searches to authenticated;
grant update (dismissed_at, dismiss_reason, dismiss_note) on public.opportunities to authenticated;
grant update (status, outcome, applied_at, status_updated_at, notes) on public.applications to authenticated;

-- profiles: read own; update own names. Rows are created by the signup trigger.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- subscriptions: read own only.
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- career_profiles: not gated on a subscription, so onboarding (account → resume
-- → preferences) works wherever checkout ends up sitting in that flow.
create policy career_profiles_select_own on public.career_profiles
  for select to authenticated using (user_id = auth.uid());
create policy career_profiles_insert_own on public.career_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy career_profiles_update_own on public.career_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- searches: read own; writes require an active subscription (read-only otherwise).
-- The active-search limit is enforced by trigger.
create policy searches_select_own on public.searches
  for select to authenticated using (user_id = auth.uid());
create policy searches_insert_own on public.searches
  for insert to authenticated with check (user_id = auth.uid() and public.has_active_access(auth.uid()));
create policy searches_update_own on public.searches
  for update to authenticated
  using (user_id = auth.uid() and public.has_active_access(auth.uid()))
  with check (user_id = auth.uid());
create policy searches_delete_own on public.searches
  for delete to authenticated using (user_id = auth.uid() and public.has_active_access(auth.uid()));

-- jobs: readable when linked to one of the user's opportunities or applications.
create policy jobs_select_linked on public.jobs
  for select to authenticated using (
    exists (select 1 from public.opportunities o where o.job_id = jobs.id and o.user_id = auth.uid())
    or exists (select 1 from public.applications a where a.job_id = jobs.id and a.user_id = auth.uid())
  );

create policy search_runs_select_own on public.search_runs
  for select to authenticated using (user_id = auth.uid());

-- opportunities: read own; the user may dismiss ("Not for me").
create policy opportunities_select_own on public.opportunities
  for select to authenticated using (user_id = auth.uid());
create policy opportunities_dismiss_own on public.opportunities
  for update to authenticated
  using (user_id = auth.uid() and public.has_active_access(auth.uid()))
  with check (user_id = auth.uid());

create policy evidence_select_own on public.evidence
  for select to authenticated using (user_id = auth.uid());
create policy rejections_select_own on public.rejections
  for select to authenticated using (user_id = auth.uid());
create policy application_packages_select_own on public.application_packages
  for select to authenticated using (user_id = auth.uid());

-- applications: read own; manual status tracking while subscribed.
create policy applications_select_own on public.applications
  for select to authenticated using (user_id = auth.uid());
create policy applications_update_own on public.applications
  for update to authenticated
  using (user_id = auth.uid() and public.has_active_access(auth.uid()))
  with check (user_id = auth.uid());

create policy activity_select_own on public.activity
  for select to authenticated using (user_id = auth.uid());

-- Helper functions callable by signed-in users (they only ever answer for the caller).
revoke all on function public.has_active_access(uuid) from public;
revoke all on function public.current_plan(uuid) from public;
revoke all on function public.preparations_used(uuid) from public;
grant execute on function public.has_active_access(uuid) to authenticated, service_role;
grant execute on function public.current_plan(uuid) to authenticated, service_role;
grant execute on function public.preparations_used(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: private buckets, one folder per user (<user_id>/...)
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false), ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "resumes_select_own" on storage.objects;
drop policy if exists "resumes_insert_own" on storage.objects;
drop policy if exists "resumes_update_own" on storage.objects;
drop policy if exists "resumes_delete_own" on storage.objects;
drop policy if exists "documents_select_own" on storage.objects;

create policy "resumes_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resumes_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resumes_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resumes_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Generated PDFs are written by the service role; users can only read their own.
create policy "documents_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

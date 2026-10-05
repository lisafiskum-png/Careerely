-- Database performance hardening.
-- 1) Give frequently joined foreign-key columns their own leading indexes.
-- 2) Cache auth.uid() once per statement in RLS policies instead of per row.
--
-- All changes are additive/semantics-preserving. Legacy prototype tables are
-- handled conditionally so clean migration replays do not depend on them.

create index if not exists activity_application_id_idx
  on public.activity (application_id);
create index if not exists activity_opportunity_id_idx
  on public.activity (opportunity_id);

create index if not exists applications_job_id_idx
  on public.applications (job_id);
create index if not exists applications_opportunity_id_idx
  on public.applications (opportunity_id);
create index if not exists applications_package_id_idx
  on public.applications (package_id);

create index if not exists behavioral_signals_job_id_idx
  on public.behavioral_signals (job_id);
create index if not exists behavioral_signals_opportunity_id_idx
  on public.behavioral_signals (opportunity_id);

create index if not exists candidate_evaluations_job_id_idx
  on public.candidate_evaluations (job_id);
create index if not exists candidate_evaluations_user_id_idx
  on public.candidate_evaluations (user_id);

create index if not exists engine_tasks_opportunity_id_idx
  on public.engine_tasks (opportunity_id);
create index if not exists engine_tasks_search_id_idx
  on public.engine_tasks (search_id);
create index if not exists engine_tasks_user_id_idx
  on public.engine_tasks (user_id);

create index if not exists evidence_job_id_idx
  on public.evidence (job_id);
create index if not exists evidence_user_id_idx
  on public.evidence (user_id);

create index if not exists opportunities_job_id_idx
  on public.opportunities (job_id);
create index if not exists opportunities_run_id_idx
  on public.opportunities (run_id);
create index if not exists opportunities_search_id_idx
  on public.opportunities (search_id);

create index if not exists rejections_job_id_idx
  on public.rejections (job_id);
create index if not exists rejections_run_id_idx
  on public.rejections (run_id);
create index if not exists rejections_search_id_idx
  on public.rejections (search_id);

create index if not exists search_runs_search_id_idx
  on public.search_runs (search_id);

-- Prototype-only tables still exist in the production project. Index them when
-- present, but do not make clean installs depend on those tables.
do $$
begin
  if to_regclass('public.cover_letters') is not null then
    execute 'create index if not exists cover_letters_user_id_idx on public.cover_letters (user_id)';
  end if;
  if to_regclass('public.dream_companies') is not null then
    execute 'create index if not exists dream_companies_user_id_idx on public.dream_companies (user_id)';
  end if;
end
$$;

alter policy activity_select_own on public.activity
  using (user_id = (select auth.uid()));

alter policy application_packages_select_own on public.application_packages
  using (user_id = (select auth.uid()));

alter policy applications_select_own on public.applications
  using (user_id = (select auth.uid()));

alter policy applications_update_own on public.applications
  using (
    user_id = (select auth.uid())
    and public.has_active_access((select auth.uid()))
  )
  with check (user_id = (select auth.uid()));

alter policy behavioral_signals_select_own on public.behavioral_signals
  using (user_id = (select auth.uid()));

alter policy career_profiles_insert_own on public.career_profiles
  with check (user_id = (select auth.uid()));

alter policy career_profiles_select_own on public.career_profiles
  using (user_id = (select auth.uid()));

alter policy career_profiles_update_own on public.career_profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy evidence_select_own on public.evidence
  using (user_id = (select auth.uid()));

alter policy jobs_select_linked on public.jobs
  using (
    exists (
      select 1
      from public.opportunities o
      where o.job_id = jobs.id
        and o.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.applications a
      where a.job_id = jobs.id
        and a.user_id = (select auth.uid())
    )
  );

alter policy opportunities_dismiss_own on public.opportunities
  using (
    user_id = (select auth.uid())
    and public.has_active_access((select auth.uid()))
  )
  with check (user_id = (select auth.uid()));

alter policy opportunities_select_own on public.opportunities
  using (user_id = (select auth.uid()));

alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()));

alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy rejections_select_own on public.rejections
  using (user_id = (select auth.uid()));

alter policy search_runs_select_own on public.search_runs
  using (user_id = (select auth.uid()));

alter policy searches_delete_own on public.searches
  using (
    user_id = (select auth.uid())
    and public.has_active_access((select auth.uid()))
  );

alter policy searches_insert_own on public.searches
  with check (
    user_id = (select auth.uid())
    and public.has_active_access((select auth.uid()))
  );

alter policy searches_select_own on public.searches
  using (user_id = (select auth.uid()));

alter policy searches_update_own on public.searches
  using (
    user_id = (select auth.uid())
    and public.has_active_access((select auth.uid()))
  )
  with check (user_id = (select auth.uid()));

alter policy subscriptions_select_own on public.subscriptions
  using (user_id = (select auth.uid()));

-- Same optimization for the prototype-only policy when that table exists.
do $$
begin
  if to_regclass('public.dream_companies') is not null then
    execute 'alter policy "Users manage own companies" on public.dream_companies using ((select auth.uid()) = user_id)';
  end if;
end
$$;

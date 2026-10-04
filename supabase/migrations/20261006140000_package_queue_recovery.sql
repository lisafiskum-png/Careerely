-- Queue/package recovery hardening.
--
-- A package reservation is now finalized in one transaction, and a task that
-- dies after its final leased attempt cleans up the user-visible state instead
-- of leaving an opportunity/package stuck forever in `preparing`.

create or replace function public.finalize_application_package(
  p_opportunity uuid,
  p_package uuid,
  p_resume_changes jsonb,
  p_tailored_resume_text text,
  p_tailored_resume jsonb,
  p_has_changes boolean,
  p_cover_letter_segments jsonb,
  p_cover_letter_text text,
  p_generation_model text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  opp record;
  pkg record;
  app_id uuid;
  ts timestamptz := now();
begin
  select o.id, o.user_id, o.job_id, o.run_id, o.state
  into opp
  from public.opportunities o
  where o.id = p_opportunity
  for update;

  if not found then
    raise exception 'Opportunity not found';
  end if;

  select p.id, p.status
  into pkg
  from public.application_packages p
  where p.id = p_package and p.opportunity_id = p_opportunity
  for update;

  if not found then
    raise exception 'Package reservation not found';
  end if;

  if pkg.status = 'failed' then
    raise exception 'Package reservation is no longer active';
  end if;

  -- If a worker already committed this transaction but died before marking its
  -- queue task done, the retry reaches this function again. In that case the
  -- ready package is already complete and the remaining writes below are all
  -- idempotent.
  if pkg.status = 'preparing' then
    if opp.state <> 'preparing' then
      raise exception 'Opportunity is no longer preparing';
    end if;

    update public.application_packages
    set status = 'ready',
        resume_changes = coalesce(p_resume_changes, '[]'::jsonb),
        tailored_resume_text = p_tailored_resume_text,
        tailored_resume = p_tailored_resume,
        has_changes = p_has_changes,
        cover_letter_segments = coalesce(p_cover_letter_segments, '[]'::jsonb),
        cover_letter_text = p_cover_letter_text,
        generation_model = p_generation_model,
        completed_at = ts,
        error = null
    where id = p_package;
  end if;

  update public.opportunities
  set state = 'ready',
      ready_at = coalesce(ready_at, ts)
  where id = p_opportunity
    and state in ('preparing', 'ready');

  insert into public.applications (
    user_id, opportunity_id, package_id, job_id, status
  )
  values (
    opp.user_id, p_opportunity, p_package, opp.job_id, 'ready_to_apply'
  )
  on conflict (user_id, opportunity_id) do nothing
  returning id into app_id;

  if app_id is null then
    select a.id into app_id
    from public.applications a
    where a.user_id = opp.user_id and a.opportunity_id = p_opportunity;
  end if;

  if opp.run_id is not null then
    update public.search_runs
    set jobs_prepared = jobs_prepared + 1,
        prepared_opportunity_ids = array_append(prepared_opportunity_ids, p_opportunity)
    where id = opp.run_id
      and not (p_opportunity = any(prepared_opportunity_ids));
  end if;

  if not exists (
    select 1
    from public.activity a
    where a.user_id = opp.user_id
      and a.kind = 'application_prepared'
      and a.opportunity_id = p_opportunity
  ) then
    insert into public.activity (
      user_id, kind, opportunity_id, application_id, payload
    )
    values (
      opp.user_id, 'application_prepared', p_opportunity, app_id, '{}'::jsonb
    );
  end if;

  return app_id;
end;
$$;

revoke execute on function public.finalize_application_package(uuid, uuid, jsonb, text, jsonb, boolean, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_application_package(uuid, uuid, jsonb, text, jsonb, boolean, jsonb, text, text)
  to service_role;

-- Lease expiry used to mark the queue task failed without running the same
-- cleanup as handleFailure(). Do the cleanup in the claim transaction before
-- claiming the next work item. New prepare tasks carry their package id; the
-- legacy fallback only touches a reservation created alongside the old task,
-- so an obsolete task can never fail a newer reservation.
create or replace function public.claim_engine_tasks(p_limit integer, p_lease_seconds integer)
returns setof public.engine_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  dead record;
  dead_package uuid;
begin
  for dead in
    update public.engine_tasks t
    set status = 'failed',
        last_error = coalesce(t.last_error, 'lease expired'),
        locked_until = null
    where t.status = 'running'
      and t.locked_until < now()
      and t.attempts >= t.max_attempts
    returning t.id, t.kind, t.opportunity_id, t.search_id, t.payload,
              t.last_error, t.created_at
  loop
    if dead.kind = 'prepare_package' and dead.opportunity_id is not null then
      dead_package := null;

      if nullif(dead.payload ->> 'package_id', '') is not null then
        update public.application_packages p
        set status = 'failed',
            error = left(coalesce(dead.last_error, 'lease expired'), 1000)
        where p.id = (dead.payload ->> 'package_id')::uuid
          and p.opportunity_id = dead.opportunity_id
          and p.status = 'preparing'
        returning p.id into dead_package;
      else
        -- Compatibility for tasks created before package ids were embedded in
        -- task payloads. Only fail the reservation created with that task.
        update public.application_packages p
        set status = 'failed',
            error = left(coalesce(dead.last_error, 'lease expired'), 1000)
        where p.opportunity_id = dead.opportunity_id
          and p.status = 'preparing'
          and p.created_at <= dead.created_at + interval '1 minute'
        returning p.id into dead_package;
      end if;

      if dead_package is not null then
        update public.opportunities o
        set state = 'shortlisted',
            preparing_started_at = null
        where o.id = dead.opportunity_id
          and o.state = 'preparing';
      end if;

    elsif dead.kind = 'scan_search'
      and nullif(dead.payload ->> 'run_id', '') is not null then
      update public.search_runs r
      set status = 'failed',
          error = left(coalesce(dead.last_error, 'lease expired'), 2000),
          finished_at = coalesce(r.finished_at, now())
      where r.id = (dead.payload ->> 'run_id')::uuid
        and r.status = 'running';
    end if;
  end loop;

  return query
  update public.engine_tasks t
  set status = 'running',
      attempts = t.attempts + 1,
      locked_until = now() + make_interval(secs => p_lease_seconds)
  where t.id in (
    select q.id
    from public.engine_tasks q
    where (q.status = 'queued' and q.run_after <= now())
       or (q.status = 'running' and q.locked_until < now() and q.attempts < q.max_attempts)
    order by q.run_after, q.created_at
    limit p_limit
    for update skip locked
  )
  returning t.*;
end;
$$;

revoke execute on function public.claim_engine_tasks(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_engine_tasks(integer, integer) to service_role;

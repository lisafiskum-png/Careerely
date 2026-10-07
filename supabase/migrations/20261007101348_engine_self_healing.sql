-- Repeated transient source failures should stop consuming worker capacity.
-- The scheduler rechecks degraded boards after one day and missing boards
-- after the existing seven-day interval.
alter table public.source_health
  drop constraint if exists source_health_state_check;
alter table public.source_health
  add constraint source_health_state_check
  check (state in ('not_found', 'degraded'));

-- Keep one recent failure per board for diagnostics and remove only redundant
-- historical source failures. AI failures are deliberately retained until the
-- provider-credit incident can be resolved and retried separately.
with ranked as (
  select id,
         row_number() over (
           partition by payload ->> 'provider', payload ->> 'slug'
           order by updated_at desc, id desc
         ) as position
  from public.engine_tasks
  where kind = 'sync_source'
    and status = 'failed'
)
delete from public.engine_tasks t
using ranked r
where t.id = r.id
  and r.position > 1;

-- Lease recovery also settles old search runs that have no queue task carrying
-- their run id. This closes the narrow crash window between inserting a run
-- and persisting that id in the task payload. The age guard is the same as the
-- task lease, so a legitimate in-flight initialization is never interrupted.
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
  update public.search_runs r
  set status = 'failed',
      error = coalesce(r.error, 'No active queue task owns this expired search run.'),
      finished_at = coalesce(r.finished_at, now())
  where r.status = 'running'
    and r.started_at < now() - make_interval(secs => p_lease_seconds)
    and not exists (
      select 1
      from public.engine_tasks t
      where t.kind = 'scan_search'
        and t.status in ('queued', 'running')
        and t.payload ->> 'run_id' = r.id::text
    );

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
    order by
      case q.kind
        when 'scan_search' then 0
        when 'decide_preparation' then 1
        when 'prepare_package' then 2
        when 'discover_search' then 3
        when 'market_cycle' then 4
        when 'sync_source' then 5
        else 6
      end,
      q.run_after,
      q.created_at
    limit p_limit
    for update skip locked
  )
  returning t.*;
end;
$$;

revoke execute on function public.claim_engine_tasks(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_engine_tasks(integer, integer)
  to service_role;

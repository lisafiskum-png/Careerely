-- A Search can have only one active run. Overlapping market cycles previously
-- allowed several phase-start tasks to create runs concurrently, and a failure
-- between inserting the run and persisting its id on the task could orphan it.

-- Keep a run only when a live queue task still owns it. Everything else is
-- historical failure data and must not keep the dashboard in a scanning state.
update public.search_runs r
set status = 'failed',
    error = coalesce(r.error, 'No active queue task owns this search run.'),
    finished_at = coalesce(r.finished_at, now())
where r.status = 'running'
  and not exists (
    select 1
    from public.engine_tasks t
    where t.kind = 'scan_search'
      and t.status in ('queued', 'running')
      and t.payload ->> 'run_id' = r.id::text
  );

-- If legacy concurrency left more than one live run for a search, preserve the
-- newest owned run and settle the older duplicates before adding the invariant.
with ranked as (
  select id,
         row_number() over (
           partition by search_id
           order by started_at desc, id desc
         ) as position
  from public.search_runs
  where status = 'running'
)
update public.search_runs r
set status = 'failed',
    error = coalesce(r.error, 'Superseded by a newer active search run.'),
    finished_at = coalesce(r.finished_at, now())
from ranked x
where r.id = x.id
  and x.position > 1;

create unique index if not exists search_runs_one_running_per_search_idx
  on public.search_runs (search_id)
  where status = 'running';

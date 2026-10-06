-- Stop pre-backpressure work from starving current user tasks. Historical rows
-- remain available for diagnosis; this migration only transitions their state.

-- A crashed worker may leave both its task and SearchRun looking active. Ten
-- minutes is the queue lease, so anything older can no longer be legitimate.
update public.search_runs r
set status = 'failed',
    error = coalesce(r.error, 'Worker lease expired before queue backpressure repair.'),
    finished_at = coalesce(r.finished_at, now())
where r.status = 'running'
  and r.started_at < now() - interval '10 minutes';

update public.engine_tasks t
set status = 'failed',
    last_error = coalesce(t.last_error, 'Worker lease expired before queue backpressure repair.'),
    locked_until = null
where t.status = 'running'
  and t.locked_until < now();

-- Old cycles and source refreshes were produced at a rate the worker could
-- never drain. Mark them superseded; the staggered scheduler recreates only
-- the small slice that is actually due in the current six-hour window.
update public.engine_tasks
set status = 'done',
    last_error = 'Superseded by staggered source scheduling.',
    locked_until = null
where status = 'queued'
  and kind in ('market_cycle', 'sync_source');

-- A search needs at most one pending scan. Preserve the newest queued task for
-- each search and supersede older continuous-cycle duplicates.
with ranked as (
  select id,
         row_number() over (
           partition by search_id
           order by created_at desc, id desc
         ) as position
  from public.engine_tasks
  where status = 'queued'
    and kind = 'scan_search'
    and search_id is not null
)
update public.engine_tasks t
set status = 'done',
    last_error = 'Superseded by a newer pending scan.',
    locked_until = null
from ranked r
where t.id = r.id
  and r.position > 1;

-- Keep claims fast as the immutable task history grows.
create index if not exists engine_tasks_claimable_idx
  on public.engine_tasks (run_after, created_at)
  where status in ('queued', 'running');

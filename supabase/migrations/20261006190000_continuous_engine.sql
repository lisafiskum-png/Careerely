-- Careerely scans the market continuously rather than in one overnight batch.

alter table public.engine_tasks
  drop constraint if exists engine_tasks_kind_check;

-- Preserve historical task records while removing the old scheduler vocabulary.
update public.engine_tasks
set kind = 'market_cycle'
where kind = 'nightly';

alter table public.engine_tasks
  add constraint engine_tasks_kind_check
  check (kind = any (array[
    'market_cycle'::text,
    'sync_source'::text,
    'scan_search'::text,
    'decide_preparation'::text,
    'prepare_package'::text
  ]));

-- Production uses pg_cron + pg_net to call /api/engine/tick. Run the worker
-- every minute so newly queued searches/packages are picked up quickly. Use
-- pg_cron's public API instead of writing cron.job directly (managed Supabase
-- correctly blocks direct UPDATE privileges on that system table).
do $$
declare
  v_jobid bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_jobid
    from cron.job
    where jobname = 'careerely-engine-tick'
    limit 1;

    if v_jobid is not null then
      perform cron.alter_job(v_jobid, schedule := '* * * * *');
    end if;
  end if;
end
$$;

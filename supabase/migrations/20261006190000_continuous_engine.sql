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
-- every minute so newly queued searches/packages are picked up quickly. The
-- application itself only creates a fresh full-market cycle every five minutes.
do $$
begin
  if to_regclass('cron.job') is not null then
    execute $sql$
      update cron.job
      set schedule = '* * * * *'
      where jobname = 'careerely-engine-tick'
    $sql$;
  end if;
end
$$;

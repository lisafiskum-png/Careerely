-- Feature-gated global job discovery task. The application does not enqueue
-- this task unless GLOBAL_JOB_DISCOVERY_ENABLED=true and SERPAPI_KEY exists.

alter table public.engine_tasks drop constraint if exists engine_tasks_kind_check;
alter table public.engine_tasks
  add constraint engine_tasks_kind_check
  check (kind in ('market_cycle', 'sync_source', 'discover_search', 'scan_search', 'decide_preparation', 'prepare_package'));

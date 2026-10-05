-- Feature-gated global job discovery task. Applied after the continuous-engine
-- migration so fresh databases retain every valid queue kind.

alter table public.engine_tasks drop constraint if exists engine_tasks_kind_check;
alter table public.engine_tasks
  add constraint engine_tasks_kind_check
  check (kind in ('market_cycle', 'sync_source', 'discover_search', 'scan_search', 'decide_preparation', 'prepare_package'));

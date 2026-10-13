-- Bound evaluation history and make the recurring scan query proportional to
-- distinct search/job pairs, not to every historical provider failure.

with ranked as (
  select run_id,
         job_id,
         row_number() over (
           partition by search_id, job_id
           order by evaluated_at desc nulls last, created_at desc, run_id desc
         ) as position
  from public.candidate_evaluations
  where search_id is not null
)
delete from public.candidate_evaluations e
using ranked r
where e.run_id = r.run_id
  and e.job_id = r.job_id
  and r.position > 1;

-- The engine reads the latest retry/cooldown state for one search at a time.
create index if not exists candidate_evaluations_search_latest_idx
  on public.candidate_evaluations (search_id, job_id, evaluated_at desc, created_at desc)
  where status in ('not_selected', 'unevaluable', 'failed');

-- Two evaluation outcomes that are not rejections (Phase C correction).
--
--   not_selected — the role passed the shortlist threshold but fell outside the
--                  run's nightly cap. Eligible, not rejected: it competes again
--                  in a future scan.
--   unevaluable  — not enough traceable evidence to score the role. Its fit is
--                  unknown (absence of evidence = unknown, never negative); it
--                  is not given a score and is not rejected.
--
-- Both are internal engine states kept on candidate_evaluations with their
-- reason. inputs_hash fingerprints what the evaluation saw (resume, search
-- preferences, posting) so an unevaluable role is re-evaluated only once one
-- of those changes, rather than spending AI evaluations on identical inputs. The canonical RejectionRecord is not used for either, so
-- OPPORTUNITY_ENGINE_SCHEMA.ts needs no change.

alter table public.candidate_evaluations
  add column if not exists search_id uuid references public.searches (id) on delete cascade;
alter table public.candidate_evaluations add column if not exists reason text;
alter table public.candidate_evaluations add column if not exists evaluated_at timestamptz;
alter table public.candidate_evaluations add column if not exists inputs_hash text;

alter table public.candidate_evaluations drop constraint if exists candidate_evaluations_status_check;
alter table public.candidate_evaluations add constraint candidate_evaluations_status_check
  check (status in ('pending', 'evaluated', 'failed', 'not_selected', 'unevaluable'));

create index if not exists candidate_evaluations_search_status_idx
  on public.candidate_evaluations (search_id, status, job_id);

alter table public.search_runs add column if not exists jobs_not_selected integer not null default 0;
alter table public.search_runs add column if not exists jobs_unevaluable integer not null default 0;

-- Job-board sources (Phase D8): remember boards confirmed missing so the
-- nightly run stops queueing them. A board is recorded here only when its
-- provider answers 404 / 410 for that exact provider + slug (wrong or
-- outdated slug, company moved ATS, board removed). It is keyed by provider +
-- slug, so correcting a source in lib/engine/companies.ts syncs the new board
-- immediately. A missing board is rechecked once a week (a single attempt),
-- and a successful sync removes its row. Temporary failures (429, 5xx,
-- timeouts, network) are never recorded here; they are retried as before.

create table if not exists public.source_health (
  provider text not null check (provider in ('greenhouse', 'lever', 'ashby')),
  slug text not null,
  state text not null default 'not_found' check (state in ('not_found')),
  http_status integer,
  detected_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  recheck_after timestamptz not null,
  primary key (provider, slug)
);

alter table public.source_health enable row level security;
revoke all on public.source_health from anon, authenticated;

-- Backfill (production evidence 2026-10-02: the 56 boards failing every day
-- all answered HTTP 404). Boards whose most recent finished sync failed with
-- a stored HTTP 404 or 410 are recorded as missing now, so they aren't queued
-- and failed once more on the next nightly run. Provider and slug come only
-- from sync_source task payloads; both error formats are recognised:
--   "<url> → HTTP 404"                      (before D8)
--   "<provider>/<slug>: HTTP 404 (not_found)" (D8)
-- Not backfilled: 403, 429, 5xx, timeouts, malformed or unknown errors, tasks
-- still being retried, and boards whose latest sync succeeded. Historical
-- engine_tasks are only read. Idempotent: existing rows are left as they are.
insert into public.source_health (provider, slug, state, http_status, detected_at, last_checked_at, recheck_after)
select provider, slug, 'not_found', http_status, failed_at, failed_at, failed_at + interval '7 days'
from (
  select distinct on (t.payload ->> 'provider', t.payload ->> 'slug')
    t.payload ->> 'provider' as provider,
    t.payload ->> 'slug' as slug,
    t.status,
    substring(t.last_error from 'HTTP (404|410)([^0-9]|$)')::integer as http_status,
    t.updated_at as failed_at
  from public.engine_tasks t
  where t.kind = 'sync_source'
    and t.status in ('done', 'failed')
    and t.payload ->> 'provider' in ('greenhouse', 'lever', 'ashby')
    and coalesce(t.payload ->> 'slug', '') <> ''
  order by t.payload ->> 'provider', t.payload ->> 'slug', t.updated_at desc
) latest
where latest.status = 'failed' and latest.http_status in (404, 410)
on conflict (provider, slug) do nothing;

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

-- Searches (Phase D8): a per-user daily safety cap on immediate scans started
-- by Search actions (creating an active search, resuming a paused one).
-- Cost/abuse protection, not a plan entitlement shown to users. Onboarding's
-- first scan, nightly scans and continuation of a started scan never use it.
-- When the cap is reached the search is still saved / resumed and active; it
-- simply waits for the next nightly scan.
--
-- V1 limits per UTC day, mirrored by IMMEDIATE_SCANS_PER_DAY in lib/plans.ts
-- (a test keeps the two in sync): Basic 1, Pro 5, Max 10.

create or replace function public.immediate_scan_limit(p public.plan_id)
returns integer
language sql
immutable
as $$
  select case p when 'basic' then 1 when 'pro' then 5 when 'max' then 10 end;
$$;

create table if not exists public.immediate_scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  used integer not null check (used >= 0),
  primary key (user_id, day)
);

alter table public.immediate_scan_usage enable row level security;
revoke all on public.immediate_scan_usage from anon, authenticated;

-- Claims one immediate scan for the user's current UTC day, if their plan's
-- allowance has room. Race-safe: the insert-or-increment is one statement on
-- the (user, day) row, which concurrent claims wait on, so parallel requests
-- can't exceed the limit. Returns whether the scan may run now.
create or replace function public.claim_immediate_scan(uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.plan_id;
  lim integer;
  today date := (now() at time zone 'utc')::date;
  claimed integer;
begin
  plan := public.current_plan(uid);
  if plan is null then
    return false;
  end if;
  lim := public.immediate_scan_limit(plan);
  if lim is null or lim < 1 then
    return false;
  end if;

  insert into public.immediate_scan_usage as u (user_id, day, used)
  values (uid, today, 1)
  on conflict (user_id, day) do update
    set used = u.used + 1
    where u.used < lim
  returning u.used into claimed;
  return claimed is not null;
end;
$$;

revoke all on function public.claim_immediate_scan(uuid) from public, anon, authenticated;
grant execute on function public.claim_immediate_scan(uuid) to service_role;

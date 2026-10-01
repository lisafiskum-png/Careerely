-- Settings and billing (Phase D6): downgrading below the active-search count
-- (decision 2026-10-02). When the user's effective plan limit is lower than
-- their active searches, Careerely pauses only the excess, keeping the search
-- created from their preferences first, then the oldest (created_at, then id).
-- The pause is recorded so the app can tell the user which searches were
-- paused by the plan change, and it is never undone automatically.
--
-- "Effective" = the plan stored from Stripe's current subscription item. A
-- downgrade scheduled for the end of the period keeps the current price on the
-- subscription until that date, so the stored plan and its limits only drop
-- when the downgrade takes effect.

alter table public.searches add column if not exists paused_by_plan_change_at timestamptz;

-- Resuming a search (or any return to active) clears the marker. A paused
-- search can't otherwise carry it unless the plan change set it.
create or replace function public.clear_plan_change_pause()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' then
    new.paused_by_plan_change_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists searches_clear_plan_change_pause on public.searches;
create trigger searches_clear_plan_change_pause
  before insert or update on public.searches
  for each row execute function public.clear_plan_change_pause();

-- Pauses the active searches above the user's effective plan limit. Idempotent:
-- once within the limit there is nothing more to pause, so repeated webhook
-- deliveries change nothing. Without access (read-only) nothing is changed;
-- the engine already stops scanning for read-only accounts. Returns the number
-- of searches paused.
create or replace function public.apply_plan_search_limit(uid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.plan_id;
  lim integer;
  paused integer;
begin
  plan := public.current_plan(uid);
  if plan is null then
    return 0;
  end if;
  select l.active_searches into lim from public.plan_limits(plan) l;
  if lim is null then
    return 0;
  end if;

  with ranked as (
    select s.id, row_number() over (order by s.created_from_profile desc, s.created_at asc, s.id asc) as position
    from public.searches s
    where s.user_id = uid and s.status = 'active'
  )
  update public.searches s
  set status = 'paused', paused_by_plan_change_at = now()
  from ranked r
  where s.id = r.id and r.position > lim and s.status = 'active';
  get diagnostics paused = row_count;
  return paused;
end;
$$;

revoke all on function public.apply_plan_search_limit(uuid) from public, anon, authenticated;
grant execute on function public.apply_plan_search_limit(uuid) to service_role;

-- The user may dismiss the notice (clear the marker) on their own searches.
grant update (paused_by_plan_change_at) on public.searches to authenticated;

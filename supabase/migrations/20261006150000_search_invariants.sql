-- Mirror Search API invariants in Postgres so direct PostgREST writes cannot
-- feed oversized/out-of-contract search input into the engine. Also serialize
-- active-search limit checks per user to close the concurrent create/resume race.

create or replace function public.valid_search_text_array(
  p_values text[],
  p_min_items integer,
  p_max_items integer,
  p_max_length integer
)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select p_values is not null
    and cardinality(p_values) between p_min_items and p_max_items
    and not exists (
      select 1
      from unnest(p_values) as v
      where length(btrim(v)) < 1 or length(btrim(v)) > p_max_length
    )
    and cardinality(p_values) = (
      select count(distinct lower(btrim(v)))::integer
      from unnest(p_values) as v
    );
$$;

revoke execute on function public.valid_search_text_array(text[], integer, integer, integer) from public, anon;
grant execute on function public.valid_search_text_array(text[], integer, integer, integer) to authenticated, service_role;

alter table public.searches drop constraint if exists searches_name_shape;
alter table public.searches add constraint searches_name_shape
  check (length(btrim(name)) between 1 and 80);

alter table public.searches drop constraint if exists searches_target_roles_shape;
alter table public.searches add constraint searches_target_roles_shape
  check (public.valid_search_text_array(target_roles, 1, 3, 80));

alter table public.searches drop constraint if exists searches_industries_shape;
alter table public.searches add constraint searches_industries_shape
  check (public.valid_search_text_array(industries, 0, 5, 80));

alter table public.searches drop constraint if exists searches_locations_shape;
alter table public.searches add constraint searches_locations_shape
  check (public.valid_search_text_array(locations, 0, 10, 80));

alter table public.searches drop constraint if exists searches_work_styles_shape;
alter table public.searches add constraint searches_work_styles_shape
  check (cardinality(work_styles) between 1 and 3);

alter table public.searches drop constraint if exists searches_min_compensation_range;
alter table public.searches add constraint searches_min_compensation_range
  check (min_compensation is null or min_compensation between 1 and 10000000);

create or replace function public.enforce_active_search_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.plan_id;
  lim integer;
  active_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  -- Serialize active transitions for this user. Without this lock, two
  -- concurrent writes can both count the same pre-existing rows and both pass
  -- a one-search plan limit.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 73));

  plan := public.current_plan(new.user_id);
  if plan is null then
    raise exception 'An active subscription is required to run searches'
      using errcode = 'P0001', hint = 'subscription_required';
  end if;

  select l.active_searches into lim from public.plan_limits(plan) l;
  if lim is null then
    return new;
  end if;

  select count(*) into active_count
  from public.searches s
  where s.user_id = new.user_id and s.status = 'active' and s.id <> new.id;

  if active_count >= lim then
    raise exception 'Active search limit reached for this plan'
      using errcode = 'P0001', hint = 'active_search_limit';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_active_search_limit() from public, anon, authenticated;

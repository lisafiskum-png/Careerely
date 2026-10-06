-- Serialize scan starts on the parent search row. A partial unique index catches
-- concurrent inserts, but it also prevents legitimate historical fixtures and
-- makes the application depend on translating a constraint error into control
-- flow. Holding the search row lock makes the "check then insert" atomic.
drop index if exists public.search_runs_one_running_per_search_idx;

create or replace function public.start_search_run(
  p_user_id uuid,
  p_search_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  search_owner uuid;
  existing_run_id uuid;
  new_run_id uuid;
begin
  select s.user_id
    into search_owner
  from public.searches s
  where s.id = p_search_id
  for update;

  if search_owner is null or search_owner is distinct from p_user_id then
    raise exception 'Search not found';
  end if;

  select r.id
    into existing_run_id
  from public.search_runs r
  where r.search_id = p_search_id
    and r.status = 'running'
  order by r.started_at desc, r.id desc
  limit 1;

  if existing_run_id is not null then
    return null;
  end if;

  insert into public.search_runs (user_id, search_id, status)
  values (p_user_id, p_search_id, 'running')
  returning id into new_run_id;

  return new_run_id;
end;
$$;

revoke execute on function public.start_search_run(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_search_run(uuid, uuid)
  to service_role;

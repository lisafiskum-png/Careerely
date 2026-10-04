-- Atomic rolling-window usage claims for metered AI actions.
--
-- The previous application flow counted usage and inserted the event in two
-- separate requests. Parallel requests could all observe the same count and
-- overspend the user's allowance. This RPC serializes claims per user/kind in
-- one transaction and records the successful claim before returning.

create index if not exists usage_events_user_kind_created_idx
  on public.usage_events (user_id, kind, created_at desc);

create or replace function public.claim_usage_event(
  p_user uuid,
  p_kind text,
  p_max integer,
  p_window_hours integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  if p_user is null
     or nullif(btrim(p_kind), '') is null
     or p_max < 1
     or p_window_hours < 1 then
    return false;
  end if;

  -- One claimant at a time for this exact user's metered action. Transaction
  -- scope means the lock is always released on commit/rollback.
  perform pg_advisory_xact_lock(
    hashtextextended(p_user::text || ':' || p_kind, 0)
  );

  select count(*)::integer
  into used
  from public.usage_events u
  where u.user_id = p_user
    and u.kind = p_kind
    and u.created_at >= now() - make_interval(hours => p_window_hours);

  if used >= p_max then
    return false;
  end if;

  insert into public.usage_events (user_id, kind)
  values (p_user, p_kind);

  return true;
end;
$$;

revoke execute on function public.claim_usage_event(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_usage_event(uuid, text, integer, integer)
  to service_role;

-- Pre-launch security hardening.
--
-- 1) Legacy prototype tables are no longer exposed through PostgREST.
-- 2) Internal SECURITY DEFINER / trigger helpers cannot be called directly by
--    anonymous or signed-in clients.
-- 3) The one access helper intentionally used by RLS is self-only for a
--    signed-in caller, while service/trigger calls (no auth.uid()) still work.
-- 4) Pure/trigger helper functions use an explicit search_path.

-- Legacy tables are not used by the current app. Keep the data for now, but
-- make it inaccessible to browser roles until the legacy data is retired.
alter table if exists public.cover_letters enable row level security;
alter table if exists public.waitlist enable row level security;
revoke all privileges on table public.cover_letters from anon, authenticated;
revoke all privileges on table public.waitlist from anon, authenticated;

-- Canonical access helper. RLS policies need authenticated callers to be able
-- to execute it, but a user must not be able to probe another user's account.
create or replace function public.has_active_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null and uid is distinct from auth.uid() then false
    else exists (
      select 1
      from public.subscriptions s
      where s.user_id = uid
        and s.plan is not null
        and s.current_period_end is not null
        and least(
          s.current_period_end,
          coalesce(s.cancel_at, s.current_period_end)
        ) > now()
        and s.status in ('active', 'trialing', 'past_due', 'canceled')
    )
  end;
$$;

revoke execute on function public.has_active_access(uuid) from public, anon;
grant execute on function public.has_active_access(uuid) to authenticated, service_role;

-- Engine/server-only RPCs. SECURITY DEFINER makes direct client execution
-- particularly dangerous because RLS is bypassed inside the function.
revoke execute on function public.claim_engine_tasks(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_engine_tasks(integer, integer) to service_role;

revoke execute on function public.reserve_preparations(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.reserve_preparations(uuid, uuid[], integer) to service_role;

revoke execute on function public.record_prepared(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_prepared(uuid, uuid) to service_role;

revoke execute on function public.preparations_used(uuid) from public, anon, authenticated;
grant execute on function public.preparations_used(uuid) to service_role;

revoke execute on function public.current_plan(uuid) from public, anon, authenticated;
grant execute on function public.current_plan(uuid) to service_role;

-- Trigger-only helpers should never be callable as public RPCs.
revoke execute on function public.enforce_active_search_limit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.clear_plan_change_pause() from public, anon, authenticated;
revoke execute on function public.guard_application_status() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- These pure helpers may remain callable, but pin search_path so future object
-- shadowing cannot affect their behaviour.
alter function public.set_updated_at() set search_path = public;
alter function public.plan_limits(public.plan_id) set search_path = public;
alter function public.immediate_scan_limit(public.plan_id) set search_path = public;

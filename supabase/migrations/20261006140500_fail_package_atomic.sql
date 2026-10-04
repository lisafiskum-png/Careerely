-- Atomic failure cleanup for a specific package reservation. A stale queue task
-- cannot fail a newer reservation because the package id is part of the call.

create or replace function public.fail_application_package(
  p_opportunity uuid,
  p_package uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed uuid;
begin
  update public.application_packages p
  set status = 'failed',
      error = left(coalesce(p_reason, 'package generation failed'), 1000)
  where p.id = p_package
    and p.opportunity_id = p_opportunity
    and p.status = 'preparing'
  returning p.id into changed;

  if changed is null then
    return false;
  end if;

  update public.opportunities o
  set state = 'shortlisted',
      preparing_started_at = null
  where o.id = p_opportunity
    and o.state = 'preparing';

  return true;
end;
$$;

revoke execute on function public.fail_application_package(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_application_package(uuid, uuid, text)
  to service_role;

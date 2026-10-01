-- Applications page (Phase D4) status rules, enforced in the database as well
-- as in the app, because signed-in users can update these columns directly:
--   * an application never goes back to "Ready to apply" once submitted;
--   * Declined / Withdrawn (closed outcomes) only apply to a submitted
--     application, not to one still waiting to be applied to;
--   * Applied needs an applied date.

create or replace function public.guard_application_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'ready_to_apply' and new.status = 'ready_to_apply' then
    raise exception 'A submitted application cannot return to Ready to apply' using errcode = 'check_violation';
  end if;
  if new.outcome is not null and new.status = 'ready_to_apply' then
    raise exception 'Only a submitted application can be closed' using errcode = 'check_violation';
  end if;
  if new.status <> 'ready_to_apply' and new.applied_at is null then
    raise exception 'A submitted application needs its applied date' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_guard_status on public.applications;
create trigger applications_guard_status
  before update of status, outcome, applied_at on public.applications
  for each row execute function public.guard_application_status();

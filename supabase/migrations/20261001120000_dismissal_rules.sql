-- "Not for me" rules (Phase D decision, 2026-10-01), enforced in the database
-- as well as in the app, because signed-in users can update these columns
-- directly:
--   * only Shortlisted opportunities can be dismissed (not Preparing or Ready);
--   * a dismissal cannot be undone in V1;
--   * the optional quick reason can be added after dismissing.

create or replace function public.guard_opportunity_dismissal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.dismissed_at is not null and new.dismissed_at is distinct from old.dismissed_at then
    raise exception 'A dismissed opportunity cannot be restored' using errcode = 'check_violation';
  end if;
  if old.dismissed_at is null and new.dismissed_at is not null and old.state <> 'shortlisted' then
    raise exception 'Only shortlisted opportunities can be dismissed' using errcode = 'check_violation';
  end if;
  if new.dismissed_at is null and (new.dismiss_reason is distinct from old.dismiss_reason or new.dismiss_note is distinct from old.dismiss_note) then
    raise exception 'A reason can only be given for a dismissed opportunity' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_guard_dismissal on public.opportunities;
create trigger opportunities_guard_dismissal
  before update of dismissed_at, dismiss_reason, dismiss_note on public.opportunities
  for each row execute function public.guard_opportunity_dismissal();

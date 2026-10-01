-- Applications (Phase D7 correction): a status change and its history event
-- are one transaction. The activity rows are the stored status history (the
-- panel's Timeline) as well as Recent activity, so a status must never change
-- without its event, and an event must never exist without its change.
--
-- Both functions run as the signed-in user's own request: they act only on
-- that user's application (auth.uid()), refuse read-only accounts (the
-- canonical has_active_access rule), lock the row, and raise with a hint the
-- API maps to a response: not_found (404), read_only (403), invalid (400),
-- not_ready / not_submitted (409). Any failure rolls back both writes. The
-- status rules trigger (guard_application_status) still applies.

create or replace function public.mark_application_applied(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  app record;
  ts timestamptz := now();
begin
  select a.id, a.status, a.opportunity_id into app
  from public.applications a
  where a.id = p_application_id and a.user_id = uid
  for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not public.has_active_access(uid) then
    raise exception 'Account is read-only' using errcode = 'P0001', hint = 'read_only';
  end if;
  -- "Yes, I applied" only moves an application out of Ready to apply, once:
  -- a repeated request changes nothing and records nothing.
  if app.status <> 'ready_to_apply' then
    raise exception 'Application is not waiting to be applied to' using errcode = 'P0001', hint = 'not_ready';
  end if;

  update public.applications
  set status = 'applied', applied_at = ts, status_updated_at = ts
  where id = app.id;

  insert into public.activity (user_id, kind, opportunity_id, application_id, payload)
  values (uid, 'application_applied', app.opportunity_id, app.id, '{}'::jsonb);
end;
$$;

-- Manual tracking after applying: a stage (applied / interview / offer, which
-- also reopens a closed application) or a closed outcome (declined /
-- withdrawn, kept at its stage). Exactly one of the two is given. Choosing the
-- current state records nothing. Returns the resulting { status, outcome }.
create or replace function public.set_application_status(p_application_id uuid, p_status text default null, p_outcome text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  app record;
  new_status public.application_status;
  new_outcome public.application_outcome;
  change jsonb;
begin
  if (p_status is null) = (p_outcome is null)
     or (p_status is not null and p_status not in ('applied', 'interview', 'offer'))
     or (p_outcome is not null and p_outcome not in ('declined', 'withdrawn')) then
    raise exception 'Invalid status change' using errcode = 'P0001', hint = 'invalid';
  end if;

  select a.id, a.status, a.outcome, a.opportunity_id into app
  from public.applications a
  where a.id = p_application_id and a.user_id = uid
  for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not public.has_active_access(uid) then
    raise exception 'Account is read-only' using errcode = 'P0001', hint = 'read_only';
  end if;
  if app.status = 'ready_to_apply' then
    raise exception 'Confirm that you applied first' using errcode = 'P0001', hint = 'not_submitted';
  end if;

  if p_status is not null then
    new_status := p_status::public.application_status;
    new_outcome := null;
  else
    new_status := app.status;
    new_outcome := p_outcome::public.application_outcome;
  end if;
  change := jsonb_build_object('status', new_status, 'outcome', new_outcome);
  if new_status = app.status and new_outcome is not distinct from app.outcome then
    return change;
  end if;

  update public.applications
  set status = new_status, outcome = new_outcome, status_updated_at = now()
  where id = app.id;

  insert into public.activity (user_id, kind, opportunity_id, application_id, payload)
  values (uid, 'application_status_changed', app.opportunity_id, app.id, change);
  return change;
end;
$$;

revoke all on function public.mark_application_applied(uuid) from public, anon;
revoke all on function public.set_application_status(uuid, text, text) from public, anon;
grant execute on function public.mark_application_applied(uuid) to authenticated;
grant execute on function public.set_application_status(uuid, text, text) to authenticated;

-- These functions are the only way a signed-in user changes an application's
-- status, so no status change can skip its history event. (Notes stay
-- user-editable.)
revoke update (status, outcome, applied_at, status_updated_at) on public.applications from authenticated;

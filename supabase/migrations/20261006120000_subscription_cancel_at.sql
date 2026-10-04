-- Stripe Customer Portal can schedule cancellation with cancel_at populated while
-- cancel_at_period_end remains false. Store the actual cancellation timestamp so
-- access and Settings follow Stripe's effective end date.

alter table public.subscriptions
  add column if not exists cancel_at timestamptz;

create or replace function public.has_active_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  );
$$;

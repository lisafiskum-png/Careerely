-- Careerely sends one transactional account/subscription confirmation only
-- after Stripe Checkout succeeds. This marker makes webhook retries safe.
alter table public.profiles
  add column if not exists subscription_confirmation_sent_at timestamptz;

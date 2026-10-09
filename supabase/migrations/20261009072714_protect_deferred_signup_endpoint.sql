-- The server-side signup route deliberately bypasses Supabase's email signup
-- message. Keep that endpoint from becoming an unlimited account-creation API.
create table if not exists public.signup_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0)
);

alter table public.signup_rate_limits enable row level security;
revoke all on table public.signup_rate_limits from public, anon, authenticated;

create index if not exists signup_rate_limits_window_idx
  on public.signup_rate_limits (window_started_at);

create or replace function public.claim_signup_attempt(p_key text, p_limit integer default 10)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempts integer;
begin
  if p_key is null or length(p_key) <> 64 or p_limit < 1 then
    return false;
  end if;

  insert into public.signup_rate_limits as limits (key, window_started_at, attempts)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_started_at = case
          when limits.window_started_at < now() - interval '1 hour' then now()
          else limits.window_started_at
        end,
        attempts = case
          when limits.window_started_at < now() - interval '1 hour' then 1
          else limits.attempts + 1
        end
  returning attempts into current_attempts;

  return current_attempts <= p_limit;
end;
$$;

revoke all on function public.claim_signup_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.claim_signup_attempt(text, integer) to service_role;

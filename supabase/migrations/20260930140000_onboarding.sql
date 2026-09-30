-- Onboarding (Phase B).
--
-- Step 1: record when the user accepted the Terms of Service and Privacy Policy,
--         and remember a plan picked on the landing page (?plan=) for checkout.
-- Step 2: store the AI suggestions produced while parsing the resume
--         (roles, industries, highlights) separately from the editable resume.
-- Rate limiting for AI calls (resume parsing) via usage_events.

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists selected_plan public.plan_id;

-- Users may change the plan they intend to buy; accepting terms is set at signup.
grant update (selected_plan) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  plan_text text := meta ->> 'selected_plan';
begin
  insert into public.profiles (id, email, first_name, last_name, terms_accepted_at, selected_plan)
  values (
    new.id,
    new.email,
    nullif(meta ->> 'first_name', ''),
    nullif(meta ->> 'last_name', ''),
    case when (meta ->> 'terms_accepted') = 'true' then now() end,
    case when plan_text in ('basic', 'pro', 'max') then plan_text::public.plan_id end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Step 2 state machine: the server stores the parsed resume in resume_data
-- (a draft) and the suggestions; the user confirms the reviewed resume, which
-- sets resume_confirmed_at. Suggestions are written by the server only.
alter table public.career_profiles add column if not exists suggestions jsonb not null default '{}'::jsonb;
alter table public.career_profiles add column if not exists resume_parsed_at timestamptz;
alter table public.career_profiles add column if not exists resume_confirmed_at timestamptz;

grant insert (resume_confirmed_at) on public.career_profiles to authenticated;
grant update (resume_confirmed_at) on public.career_profiles to authenticated;

-- Append-only log of metered actions (e.g. resume parses), used for rate limits.
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_kind_created_idx on public.usage_events (user_id, kind, created_at desc);

alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;

-- Resume uploads: private bucket, 10 MB, PDF / DOC / DOCX only (matches Step 2 UI).
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'resumes';

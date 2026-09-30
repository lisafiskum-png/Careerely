# Database

The schema lives in `migrations/` and is applied with the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste the migration file into the Supabase SQL editor and run it once.

## What the foundation migration does

- Creates the data model from the Master Brief: `profiles`, `career_profiles`,
  `searches`, `jobs`, `search_runs`, `opportunities`, `evidence`, `rejections`,
  `application_packages`, `applications`, `activity`, `subscriptions`,
  `stripe_events`.
- Creates a profile automatically when a user signs up (trigger on `auth.users`)
  and backfills profiles for existing users.
- Enables row level security on every table. Users read their own rows and can
  only write the columns they directly control. Billing state and everything the
  Opportunity Engine produces are written by the service role only.
- Makes accounts without an active subscription read-only
  (`public.has_active_access`).
- Enforces the active-search limit per plan in the database.
- Creates private storage buckets `resumes` and `documents`, one folder per user.

## Legacy data

The migration never drops tables, columns or rows. From the prototype, the
tables `cover_letters` and `dream_companies` and the profile columns `plan`,
`voice_sample`, `digest_enabled` and `radar_enabled` keep their data but are no
longer used, and signed-in users can no longer write to them. Drop them once you
have confirmed nothing in them needs keeping.

## Writing new migrations

Supabase grants table privileges to `anon` and `authenticated` by default. Every
new table must enable row level security, and must revoke and re-grant write
privileges column by column like the foundation migration does.

`npm test` applies every migration to an in-memory Postgres (PGlite) and checks
the access rules in `tests/db/migrations.test.ts`.

# Careerely pre-launch audit — 2026-10-04

This file records findings from a read-only audit of the current production database and `main`. It is intentionally on the audit branch only. No production fix is implied by this document.

## Critical / must fix before real launch

### 1. Legacy public tables expose data through PostgREST

`public.cover_letters` and `public.waitlist` have RLS disabled while `SELECT` is granted to both `anon` and `authenticated`.

Production currently contains:
- `cover_letters`: 6 rows
- `waitlist`: 5 rows

The current app does not reference `cover_letters`; the landing `JoinForm` routes users to signup and does not use `waitlist`. Treat both as legacy until proven otherwise. Before launch either remove/archive them or enable RLS and revoke unnecessary client privileges.

### 2. Internal SECURITY DEFINER RPCs have overly broad EXECUTE grants

Several internal functions are executable by `anon` and/or `authenticated`, despite being intended for service-role/trigger use. The most important examples are:

- `claim_engine_tasks` — anon + authenticated can execute; mutates queue state and increments attempts.
- `reserve_preparations` — anon + authenticated can execute; creates package reservations and consumes preparation quota.
- `record_prepared` — anon + authenticated can execute; mutates search-run counters.
- `current_plan`, `has_active_access`, `preparations_used` — expose internal account state for arbitrary supplied UUIDs.
- trigger functions `enforce_active_search_limit` and `handle_new_user` also retain broad EXECUTE grants that are not required for triggers.

Keep user-facing RPCs such as `mark_application_applied`, `set_application_status`, and `dismiss_plan_change_notice` available to `authenticated` as intended. Internal engine/billing helpers should be explicitly revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role` where direct RPC execution is needed.

## High priority correctness issues

### 3. Failed package retry can become permanently stuck in `preparing`

Two production packages are currently stuck:

- Adyen — Enterprise Business Development Representative
- Wintermute — Business Development & Partnerships — All Levels

Both have a new `application_packages.status = preparing`, but their corresponding `prepare_package` task is already `done` from an earlier reservation. The task dedupe key is only `prepare:<opportunity_id>`.

Confirmed sequence:
1. Original package reservation creates `prepare:<opportunity_id>` task.
2. Package generation eventually fails and `failPackage` returns the opportunity to `shortlisted`.
3. A later scan deletes the failed package and creates a fresh `preparing` package for the same opportunity.
4. `enqueue(... dedupe_key: prepare:<opportunity_id>)` hits the old completed task and `ignoreDuplicates` silently prevents a new task.
5. The new package remains `preparing` forever and continues to consume quota.

The fix should make a preparation task unique to a reservation/package attempt, or make reservation + task creation/recovery atomic and idempotent. Also repair the two existing orphaned packages after the code fix.

### 4. `cancel_at` is not selected everywhere access is evaluated

The canonical `getAccessState()` now supports Stripe `cancel_at`, and the database `has_active_access()` uses the earlier of `cancel_at` and `current_period_end`.

However several server reads still select only `plan, status, current_period_end`, including:
- `lib/write-access.ts`
- `lib/dashboard.ts` (`getAccount`)
- `app/api/onboarding/complete/route.ts`
- `app/api/stripe-checkout/route.js`

For the current Customer Portal end-of-period cancellation, `cancel_at == current_period_end`, so this does not change the observed result. But an earlier explicit `cancel_at` can make UI/API access disagree with database enforcement. All access-state selects should include `cancel_at`.

## Medium priority / launch hygiene

### 5. Production migration history is not aligned with repository migrations

Most schema changes were applied manually in SQL, so `supabase_migrations.schema_migrations` does not contain the repository migration versions. The only recorded migration is the connector-applied `subscription_cancel_at` migration, with a generated production version different from the repository filename.

Before adopting automated `supabase db push`/CI migrations, reconcile or repair migration history so already-applied migrations are not treated as pending.

### 6. ATS source coverage is healthy operationally but incomplete

Current source state:
- 56 configured boards are `not_found` and skipped until weekly recheck.
- Recent source tasks: 34 successful sync tasks.
- Active jobs: Ashby 1,111; Greenhouse 3,238; Lever 20.
- Active board slugs represented in jobs: 33.

The skip/recheck mechanism is working. Replacing stale board slugs is a coverage improvement, not an engine-stability blocker.

### 7. Duplicate job dedupe keys exist in storage

There are 55 duplicate `jobs.dedupe_key` groups. Stage 1 already uses the dedupe key to reject repeated company/title/location combinations during a scan, so this is not currently producing duplicate shortlist entries. It does add storage/review overhead and may be worth cleaning up post-launch.

### 8. `main` has no branch protection / required CI checks

`main` is unprotected and no GitHub Actions workflow is present in the repository. Vercel deployment status is green, but tests are not automatically required before merge. Add branch protection / required checks once the launch-fix branch is ready.

### 9. Vercel connector scope needs re-authorization for deeper audit

The connected Vercel API can discover the `careerely` project, but project/runtime access returns 403 for the team scope. GitHub still reports the current Vercel deployment check as successful. Re-authorize the Vercel connection before the final production runtime-log/environment audit.

## Verified healthy

- Current `main` commit has a successful Vercel status check.
- Supabase cron is active every 5 minutes.
- Latest observed `net._http_response`: 72/72 responses were HTTP 200.
- Recent engine tasks and recent search runs are succeeding.
- No stale `running` engine tasks.
- No search runs stuck for >6 hours.
- No active searches without active access.
- No users above their plan's active-search limit.
- No owner mismatches between applications/packages and opportunities.
- No ready packages missing applications.
- No ready applications pointing at a non-ready package.
- Storage buckets `resumes` and `documents` are private.
- Resume bucket enforces a 10 MB size limit and PDF/DOC/DOCX MIME allowlist.
- Auth confirmation redirects are constrained to same-site relative paths.
- Password reset uses a non-enumerating success message and signs out all sessions after password change.
- Engine tick endpoint requires `Authorization: Bearer CRON_SECRET`.
- Stripe webhook verifies signatures and re-reads subscription state from Stripe before persisting, which protects against out-of-order event payloads.
- Security headers include frame denial, nosniff, referrer policy, and a permissions policy.

## Known final-launch operational items already tracked

- Production currently uses Stripe sandbox/test credentials for smoke testing. Switch to LIVE keys, live price IDs, live webhook secret and live Customer Portal configuration only after all fixes and final smoke testing.
- Verify Stripe live portal plan switching and cancellation behavior.
- Anthropic API balance/auto-reload monitoring should be enabled before real users rely on package generation.
- Final user-facing/UI fixes will be collected separately and handled in the final fix round.

# Careerely pre-launch audit — 2026-10-04

This file records findings from a read-only audit of the current production database and `main`. It is intentionally on the audit branch only. No production fix is implied by this document.

## Critical / must fix before real launch

### 1. Legacy public tables expose data through PostgREST

`public.cover_letters` and `public.waitlist` have RLS disabled while `SELECT` is granted to both `anon` and `authenticated`.

Production currently contains:
- `cover_letters`: 6 rows
- `waitlist`: 5 rows

`cover_letters` contains user/job/cover-letter fields (`user_id`, job URL/description, generated cover letter, title/company). `waitlist` contains email addresses. The current app does not reference `cover_letters`; the landing `JoinForm` routes users to signup and does not use `waitlist`. Treat both as legacy until proven otherwise. Before launch either remove/archive them or enable RLS and revoke unnecessary client privileges.

### 2. Internal SECURITY DEFINER RPCs have overly broad EXECUTE grants

Several internal functions are executable by `anon` and/or `authenticated`, despite being intended for service-role/trigger use. The most important examples are:

- `claim_engine_tasks` — anon + authenticated can execute. It is `SECURITY DEFINER`, changes queued tasks to `running`, increments attempts, leases them, **and returns the full claimed task rows**. This is both an engine-disruption risk and an internal-task data exposure.
- `reserve_preparations` — anon + authenticated can execute; creates package reservations, deletes failed reservations and changes opportunity state. It accepts a supplied user UUID and opportunity IDs without an `auth.uid()` check.
- `record_prepared` — anon + authenticated can execute; mutates search-run counters for supplied UUIDs.
- `preparations_used` and `current_plan` — accept an arbitrary user UUID and expose internal account state.
- `has_active_access` — also accepts an arbitrary UUID. It is legitimately used by RLS policies, so authenticated execution may be needed, but user calls should be constrained to `auth.uid()` rather than leaking arbitrary-user state.
- trigger helpers such as `enforce_active_search_limit` and `handle_new_user` retain broad EXECUTE grants that are unnecessary for direct clients.

Supabase's own security advisor independently flags the anonymous and signed-in `SECURITY DEFINER` exposure. `apply_plan_search_limit` and `claim_immediate_scan` are already service-role-only, which is the desired pattern for engine-only RPCs.

Keep user-facing RPCs such as `mark_application_applied`, `set_application_status`, and `dismiss_plan_change_notice` available to `authenticated` as intended. Internal engine/billing helpers should be explicitly revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role` where direct RPC execution is needed. Helpers used by RLS should enforce self-only semantics for normal authenticated callers.

## High priority correctness / abuse issues

### 3. Failed package retry can become permanently stuck in `preparing`

Two production packages are currently stuck in `preparing`. Both have a fresh `application_packages.status = preparing`, but their corresponding `prepare_package` task is an older task already in `done` state. The task dedupe key is only `prepare:<opportunity_id>`.

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

### 5. Database `is_my_pick` can point at an opportunity already moved to Applications

`rerankUser()` ranks every non-dismissed opportunity for the user. It does not exclude jobs that are no longer active or opportunities whose application has already moved beyond `ready_to_apply`.

The UI does exclude those rows in `getLiveOpportunities()` and then visually treats the first remaining row as My Pick. Production currently has one `is_my_pick = true` opportunity whose application has already moved into Applications.

This creates two definitions of My Pick: the database points at a hidden/submitted opportunity while the UI displays another live opportunity as the pick. Today the UI still looks sensible because it uses the remaining rank order, but the stored canonical state is inconsistent and any future code using `is_my_pick` can be wrong.

Fix by making reranking use the same live-opportunity definition as the UI (not dismissed, posting active, not moved beyond ready-to-apply), or make `is_my_pick` derived rather than persisted.

### 6. Server validation can be bypassed through direct authenticated PostgREST writes

Search API routes validate names, chip counts/lengths, work styles, currency and compensation before writing. But authenticated users also have direct `INSERT`/`UPDATE` privileges on the user-editable `searches` columns, and production RLS allows own-row writes for active subscribers.

The database does **not** mirror the main search-shape limits: it has compensation pair/format checks but no constraints for 1–3 target roles, up to 5 industries, up to 10 locations, 80-character search names or 80-character chip values. A client using the public Supabase API can therefore bypass `validateSearch()` and feed out-of-contract data into the engine.

`career_profiles` has some array-count checks, but authenticated clients can also directly write `resume_data`, `resume_text`, `resume_confirmed_at` and preference fields. `profiles.onboarding_completed_at` and `profiles.selected_plan` are also directly writable by the signed-in owner. `loadSearchContext()` validates the resume JSON shape but does not call `normalizeResume()` before flattening it for the engine, so structurally valid oversized data can bypass the normal UI normalization.

This matters because those fields become AI/search inputs and can amplify token/compute cost or bypass intended onboarding state transitions. Add database constraints and/or move sensitive mutations behind validated RPC/API boundaries; also normalize/bound context again at the engine boundary. Server validation should not be the only enforcement when the table is directly writable from the browser.

### 7. Resume-parse AI rate limit is check-then-insert, not atomic

`/api/resume/parse` checks `isOverLimit()` and only later calls `recordUsage()` before invoking Claude. The usage table itself is service-role-only, which is good, but the check and reservation are two separate operations.

Concurrent requests can all observe a count below 10 before any of them records usage, allowing a signed-in user to exceed the intended `10 / 24h` AI-call limit. Resume parsing happens before subscription checkout, so this is a direct cost-abuse surface (email confirmation still raises the bar).

Replace the count-then-insert sequence with an atomic database claim/reservation (transaction/advisory lock or a single RPC that refuses once the rolling-window cap is reached). Add a concurrency test.

### 8. Greenhouse compensation values mix annual and hourly rates but are compared as annual

Careerely's minimum-compensation preference is annual. The Greenhouse adapter stores the first `pay_input_ranges` amount as `salary_min/max` without an interval/unit field, and the hard filter compares it directly with the user's annual minimum whenever the currency matches.

Production proves mixed units are present. Active Greenhouse data currently includes 37 USD salary ranges below 1,000; examples explicitly say `hourly base pay rate` in the posting while stored values are `$46`, `$55`, `$68`, etc. A user with a normal annual USD minimum would therefore have those roles rejected as `compensation_below_floor`, even though the values are hourly and not comparable.

There is also at least one active malformed source range above USD 1M (`$152,405—$179,300,152`), which can produce absurd salary display/evidence even though it will not create a false below-floor rejection.

Because the core rule is “unknown, never negative,” compensation should only participate in hard filtering when Careerely knows the amount is an annual value in the same currency. Store an interval/period where providers expose one; otherwise conservatively leave compensation unknown or infer only from explicit trustworthy source metadata/text. Add provider fixtures for hourly and malformed pay ranges.

### 9. Work-style and remote-location preferences are not enforced consistently

The hard filter only has a special case for **remote-only** users. When the user's selected work style is only `on_site`, only `hybrid`, or a multi-select that excludes one known style, a posting with that excluded work style is not rejected.

Examples of current behavior:
- Hybrid-only can still pass an on-site or remote job.
- On-site-only can still pass remote/hybrid jobs.
- Remote + Hybrid can still pass a known on-site job.

Remote geography is also treated too broadly. A posting such as `Remote - USA` is classified as remote, and preferred locations are then not used as an eligibility constraint. `factDimensions()` can even award a 100 location-fit dimension for a remote posting simply because the user allows remote work and the location string contains “remote”, regardless of a country/region restriction.

Production currently has 746 active jobs classified as remote; 720 have non-generic location text and 336 contain obvious region/country markers such as USA, UK, Europe/EMEA, Canada, Australia, Germany, France, Spain or Norway. Ten current non-dismissed opportunities are remote jobs with such region markers.

Fix the work-style truth table and model remote geography separately from work style. A remote role with a known geographic restriction should only be treated as location-compatible when that restriction is compatible with the user's location preferences; otherwise it should be unknown or rejected only when both sides are sufficiently known.

### 10. Rejected jobs never become eligible again when the inputs change

`startScan()` builds a permanent `done` set from **all prior rejection rows** for the search plus existing opportunities. Only `unevaluable` candidates carry an `inputs_hash` and are reconsidered when the resume/search/posting changes.

That means a job rejected once for any of these reasons is skipped forever for that search:
- hard-filter mismatch such as work style/location/compensation/role category;
- a match score below the shortlist threshold.

The Search edit route explicitly says the new settings apply from the next scheduled scan, but it does not clear/re-key old rejections. So if a user changes target roles, locations, work styles or compensation, a role rejected under the old settings can never compete under the new settings. Likewise, if an ATS posting is updated materially under the same job id, a previous rejection is still terminal.

Use an input fingerprint for terminal rejection decisions too, or invalidate/re-evaluate affected rejections whenever search/resume/posting inputs change. Keep the audit trail, but do not use a stale historical rejection as a permanent eligibility lock.

### 11. Package validation can still accept unsupported non-numeric claims

The package-generation system prompt says Careerely must never invent employers, titles, dates, numbers, metrics, skills, tools or achievements, but the deterministic validator does not fully enforce that promise.

Current checks include:
- original resume text for a changed line must be found in the resume;
- unsupported **numbers** are rejected;
- all original employers must still appear in the tailored resume;
- some cover-letter segments must contain at least one evidence reference.

What is not checked:
- a revised resume line can introduce a new non-numeric skill/tool/achievement that is absent from the resume;
- an `added` resume line only needs an evidence id, not proof that the revised wording is supported by that evidence;
- the complete tailored resume is not checked for invented non-numeric facts;
- a cover-letter segment can cite a valid evidence id while making an unrelated unsupported factual claim.

This is especially important because “nothing is invented” is a core product integrity promise. Strengthen package validation around factual claims/allowed source vocabulary or add a separate source-grounding verification pass before a package becomes `ready`. Regression tests should include invented tools, employers, skills and achievements without numbers.

### 12. Active-search plan limits have a concurrency race

`enforce_active_search_limit()` counts the user's current active searches and then allows the new `active` row if the count is below the plan limit. The check is not protected by an advisory lock, row lock or unique/constraint pattern that serializes concurrent creates/resumes for the same user.

Two concurrent requests can therefore both observe a count below the limit and both become active. This matters because nightly scheduling scans every active search with active access; an over-limit state can therefore become extra AI work, not just a cosmetic plan inconsistency.

Production is currently clean — no user is above the plan limit — but the race exists in the enforcement mechanism. Serialize the limit check per user or enforce the invariant through an atomic database design, then add a concurrency test.

### 13. Checkout creation has no server-side idempotency or pending-subscription guard

`/api/stripe-checkout` prevents a new Checkout session only after Careerely already sees an active subscription. Before that point, repeated or concurrent requests can create multiple Checkout Sessions. The UI disables buttons while one request is pending, but the API itself has no idempotency key or pending-session guard.

There is an additional race when the user has no stored Stripe customer yet: concurrent requests can both create a Stripe customer before either writes it to `subscriptions`.

If multiple subscription Checkout Sessions are completed, Stripe can have multiple active subscriptions charging the same user. `syncSubscription()` stores only one `stripe_subscription_id` per Careerely user and allows a different **active** subscription to replace the currently stored active subscription, so a second live Stripe subscription can become invisible to Careerely while still billing externally.

Add server-side idempotency/pending-checkout handling and define how duplicate live subscriptions are detected/reconciled. This is a billing correctness issue, not just an abuse concern.

## Medium priority / launch hardening

### 14. AI source content is not explicitly marked as untrusted against prompt injection

Job postings are third-party ATS content and resumes are user-provided content. Both are inserted into Claude prompts. The system prompts contain strong evidence/invention rules, and `verifyEvaluation()` materially reduces risk by requiring quoted, traceable evidence and downgrading unsupported findings to unknown. Package validation also rejects unsupported numbers and dropped employers.

However the prompts do not explicitly tell the model that instructions found inside `<job_posting>`, `<candidate_resume>` or evidence/source text are data and must never override Careerely's system instructions. A malicious job description could contain prompt-injection text intended to alter scoring or generated application content.

Add explicit untrusted-source instructions to resume parsing, evaluation and package-generation system prompts and regression tests with malicious source text. Keep the deterministic evidence verification as the primary integrity backstop.

### 15. Resume extraction has upload limits but no decompressed/document-complexity cap

The `resumes` bucket is private, allows PDF/DOC/DOCX only and caps uploaded bytes at 10 MB. The parse route checks magic bytes, user ownership and rate-limits parsing. Parsed plain text is clipped to 60,000 characters before the Claude call.

`extractResumeText()` itself does not currently cap PDF page count, decompressed DOCX size, extracted text length during extraction or parser complexity. A small but highly compressed or pathological document can consume disproportionate memory/CPU before the 60,000-character prompt clip is applied.

Add pragmatic resource limits (page/decompression guards where supported and an extraction ceiling), fail cleanly, and test oversized/pathological inputs.

### 16. Package-generation retry layers can multiply Claude calls

`generatePackage()` allows two internal generation/validation attempts. `prepare_package` queue tasks have `max_attempts = 3`. If both internal attempts fail validation and the task throws, the queue can retry the whole task, producing up to six generation calls for one package reservation before final failure.

This may be intentional resilience, but it is a material cost multiplier and should be an explicit policy rather than an accidental composition of two retry loops. Decide the desired total attempt budget and test it.

### 17. Terms acceptance is enforced in the client, not as an account invariant

The signup UI requires the checkbox and sends `terms_accepted: 'true'` in Supabase Auth user metadata. The `handle_new_user()` trigger trusts that metadata and writes `terms_accepted_at` only when the value is present.

Because signup itself is a public Supabase Auth operation, a client can create an account without using the Careerely form and omit that metadata. There is no later app gate requiring `terms_accepted_at` to be present. Production already has one profile without a terms timestamp (this may be a legacy/test account, but it demonstrates that null is allowed).

If acceptance is intended to be mandatory, enforce it through the supported signup/onboarding flow or require acceptance before the account can proceed, rather than treating a client-supplied metadata flag as authoritative proof.

### 18. Resume Storage allows unlimited object count per authenticated user

The `resumes` bucket is private and limits each file to 10 MB, and its RLS correctly confines users to their own top-level folder. However the storage policy allows an authenticated user to insert any number of objects under that folder. There is no per-user object-count/storage quota and no requirement that uploads go through a server route.

The AI parse endpoint is rate-limited, but direct Storage uploads do not need to invoke parsing. A confirmed account can therefore consume storage by repeatedly uploading allowed files up to the per-object limit.

Current production usage is tiny (5 resume objects, about 251 KB total), so this is not an observed incident. Before public launch, consider a one-current-resume naming model, cleanup of superseded uploads, or a quota/rate-limited upload boundary.

### 19. Supabase leaked-password protection is disabled

The Supabase security advisor reports that Auth leaked-password protection is disabled. Enabling it blocks passwords known to be compromised through the provider's HaveIBeenPwned integration.

This is not a code vulnerability, but it is a worthwhile pre-launch account-security setting for a service storing resumes and employment data.

### 20. Production migration history is not aligned with repository migrations

Most schema changes were applied manually in SQL, so `supabase_migrations.schema_migrations` does not contain the repository migration versions. The only recorded migration is the connector-applied `subscription_cancel_at` migration, with a generated production version different from the repository filename.

Before adopting automated `supabase db push`/CI migrations, reconcile or repair migration history so already-applied migrations are not treated as pending.

### 21. ATS source coverage is healthy operationally but incomplete

Current source state:
- 56 configured boards are `not_found` and skipped until weekly recheck.
- Recent source tasks: 34 successful sync tasks.
- Active jobs: Ashby 1,111; Greenhouse 3,238; Lever 20.
- Active board slugs represented in jobs: 33.

The skip/recheck mechanism is working. Replacing stale board slugs is a coverage improvement, not an engine-stability blocker.

### 22. Duplicate job dedupe keys exist in storage

There are 55 duplicate `jobs.dedupe_key` groups. The database uniqueness constraint is `(source, source_job_id)`, while `dedupe_key` has only a non-unique index. Stage 1 already uses the dedupe key to reject repeated company/title/location combinations during a scan, so this is not currently producing duplicate shortlist entries. It does add storage/review overhead and can make source-level duplication noisier.

### 23. `main` has no branch protection / required CI checks

`main` is unprotected and no GitHub Actions workflow is present in the repository. Vercel deployment status is green, but typecheck/lint/unit/browser tests are not automatically required before merge. Add CI and required checks once the launch-fix branch is ready.

### 24. Vercel runtime observability remains inaccessible to the connector

The Vercel connector can now read the Careerely project, deployments and environment-variable metadata, and production deployment state is confirmed. Runtime log/error-cluster endpoints still return `403 Forbidden` for the correct project/team scope.

This does not block the database/code audit, but runtime-error review should be available before launch if possible (connector re-authorization or direct Vercel review).

### 25. Production Vercel still contains obsolete configuration variables

The production environment contains legacy Stripe variables (`STANDARD`/old `PRO`/`PREMIUM` monthly/annual names) and `SERPAPI_KEY`; code search found no current references to those variables. V1 intentionally uses only company ATS sources, not SerpAPI. `RESEND_API_KEY` is also present while current code search found no Resend usage.

Do not delete anything blindly during the audit. After confirming no external workflow depends on them, remove unused variables to reduce configuration drift and secret surface.

### 26. Legal data-deletion promise needs an operational/product workflow

The current Terms say a user can delete their account at any time; the Privacy Policy says account data is deleted within 30 days after account deletion and points users to Account Settings or email for privacy rights. Settings currently has no account-deletion action, and code search found no account deletion workflow.

Email support can still be a valid manual rights-request channel, but before launch there should be a documented deletion process that covers Auth, relational rows, uploaded Storage objects and any retained third-party identifiers. If self-service deletion is not shipping in V1, make the legal/UI wording match the actual supported process and verify the 30-day operational promise can be met.

## Lower priority / scale hygiene

### 27. Supabase advisor reports database performance hygiene work

The current performance advisor reports:
- 23 foreign keys without a covering index;
- 22 RLS policies that call `auth.uid()`/related auth functions per row instead of through an init-plan-friendly `(select auth.uid())` pattern;
- three currently unused indexes.

At today's data volume this is not a launch blocker, and indexes should not be added mechanically. Review the hot paths (`opportunities`, `applications`, `engine_tasks`, `candidate_evaluations`, `search_runs`, `evidence`, `activity`) and add only indexes supported by the actual query/delete patterns.

The security advisor also reports mutable `search_path` on `set_updated_at`, `plan_limits` and `immediate_scan_limit`. These three functions are not `SECURITY DEFINER`, so this is substantially lower risk than finding #2, but setting an explicit search path is still good database hygiene.

## Verified healthy

- Current `main` commit has a successful Vercel status check.
- The production Vercel deployment is `READY` and is aliased to `www.careerely.ai` / `careerely.ai`.
- Supabase cron is active every 5 minutes.
- Recent `net._http_response` rows continue to be HTTP 200 with `timed_out = false` and no error message.
- Recent engine tasks and recent search runs are succeeding.
- No stale `running` engine tasks.
- No search runs stuck for >6 hours.
- No active searches currently exceed their plan's active-search limit.
- No owner mismatches between applications/packages and opportunities.
- No ready packages missing applications.
- No ready applications pointing at a non-ready package.
- Application status/outcome columns are not directly writable by authenticated clients; status transitions go through the atomic RPCs.
- Search plan-change provenance columns are not directly writable by authenticated clients.
- Storage buckets `resumes` and `documents` are private.
- Resume bucket enforces a 10 MB size limit and PDF/DOC/DOCX MIME allowlist.
- Resume Storage RLS confines authenticated users to their own top-level user folder.
- Auth confirmation redirects are constrained to same-site relative paths.
- Password reset uses a non-enumerating success message and signs out all sessions after password change.
- Engine tick endpoint requires `Authorization: Bearer CRON_SECRET`.
- Stripe webhook verifies signatures and re-reads subscription state from Stripe before persisting, which protects against out-of-order event payloads.
- Security headers include frame denial, nosniff, referrer policy, and a permissions policy.
- External posting links are restricted to http(s) and opened with `noopener,noreferrer`.
- Prepared-document downloads validate ownership through RLS-backed opportunity detail loading and return `private, no-store` PDFs.
- No `dangerouslySetInnerHTML` use was found in current application code.
- All current Auth users have matching `profiles`, `career_profiles` and `subscriptions`; no orphan/missing-profile inconsistency was found.
- Database plan limits match application plan limits: Basic 1/10, Pro 5/50, Max unlimited/200 (active searches / monthly preparations).
- `claim_immediate_scan()` uses an atomic `INSERT ... ON CONFLICT ... UPDATE ... WHERE used < limit` pattern, so the immediate-scan daily cap itself is concurrency-safe.
- `reserve_preparations()` serializes monthly package reservation per user with an advisory transaction lock.
- `verifyEvaluation()` requires traceable quoted source text, blocks unsupported numeric claims, and converts unsupported findings to unknown rather than negative. It should not, however, be treated as proof of semantic entailment; see finding #11 for package-generation grounding.
- Supabase service-only tables (`candidate_evaluations`, `engine_tasks`, `immediate_scan_usage`, `source_health`, `stripe_events`, `usage_events`) have RLS enabled and no normal client grants; the advisor's “RLS enabled with no policy” notices for those tables are therefore expected.
- In the last 24 hours of Supabase gateway logs reviewed during this audit, no HTTP response with status >=400 was observed. The only three PostgreSQL `ERROR` entries in that window were malformed read-only audit queries issued through the management connector, not production application failures.

## Known final-launch operational items already tracked

- Production currently uses Stripe sandbox/test credentials for smoke testing. Switch to LIVE keys, live price IDs, live webhook secret and live Customer Portal configuration only after all fixes and final smoke testing.
- Verify Stripe live portal plan switching and cancellation behavior.
- Anthropic API balance/auto-reload monitoring should be enabled before real users rely on package generation.
- Final user-facing/UI fixes will be collected separately and handled in the final fix round.

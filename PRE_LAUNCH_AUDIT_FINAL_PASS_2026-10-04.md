# Careerely pre-launch audit — final pass — 2026-10-04

This final-pass note extends `PRE_LAUNCH_AUDIT_2026-10-04.md` and `PRE_LAUNCH_AUDIT_ADDENDUM_2026-10-04.md`. It is intentionally stored only on `chatgpt/security-hardening`. No production changes are implied by this file.

## New launch-blocking / high-priority findings

### 42. Production billing/AI secrets are also scoped to Preview

Vercel environment metadata currently shows `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `ANTHROPIC_API_KEY` targeted to both `production` and `preview`.

That is dangerous for the final LIVE cutover. If the production Stripe variables are replaced with live credentials while retaining the current Preview scope, preview deployments can call live Stripe and potentially create real customers/subscriptions or process live webhook configuration. Sharing the Anthropic production key with Preview also lets arbitrary preview branches consume the same paid API balance.

Before the final LIVE Stripe cutover, separate environment scope and credentials:
- Production receives LIVE Stripe secret, live publishable key, live price IDs and live webhook secret.
- Preview receives only sandbox/test Stripe credentials and test prices/webhook configuration.
- Prefer a separate Anthropic key/budget for Preview, or remove AI access from arbitrary previews where practical.
- Verify no production-only service secret is unintentionally available to Preview.

Current legacy Stripe variables and `SERPAPI_KEY` are also still present in Preview/Production even though the V1 code path no longer uses them. Remove them only after dependency review confirms they are unused.

### 43. Legal copy promises account deletion/data rights that Settings does not currently provide

Careerely's Terms state that a user can delete their account at any time. The Privacy Policy says account deletion removes personal data within 30 days and directs users to account settings or support to exercise access/correction/export/deletion rights.

Current Settings contains plan management, email and sign-out only, and repository search found no account-deletion or data-export workflow.

This is a launch/compliance mismatch even though relational foreign keys already provide good deletion cascades. Before public launch, either implement the promised self-service workflow or revise the legal copy so it accurately describes the supported process. The preferred implementation should coordinate Storage cleanup, Stripe cancellation/reconciliation, Auth-user deletion and verification of relational cleanup.

### 44. Failed AI evaluations can consume evaluation slots repeatedly on unchanged inputs

Production currently contains three failed `candidate_evaluations` rows covering two jobs. One unchanged job failed on both 3 Oct and 4 Oct. The stored error is a structured-output/schema parse failure.

`evaluateBatch()` marks the candidate row `failed`; `finalizeRun()` ignores failed evaluations; and `startScan()` does not exclude/reuse failed rows based on `inputs_hash`. The same unchanged posting can therefore be selected for Claude again in later scans, consuming one of the 20 evaluation slots and paid model calls indefinitely.

Add a bounded per-input-hash retry policy. After a small retry budget, quarantine the unchanged candidate as unevaluable/failed-for-input until its resume/search/posting input hash changes. A same-run repair attempt is fine, but nightly retries should not be unbounded.

## Additional security/configuration hardening

### 45. Three public functions have mutable `search_path`

The Supabase security advisor currently flags `public.set_updated_at`, `public.plan_limits`, and `public.immediate_scan_limit` because they do not set an explicit search path.

These are not the highest-risk functions in the database, but function hardening should set an explicit safe `search_path` (typically `public` or empty + qualified references as appropriate), especially while the RPC/grant migration is being written.

### 46. Resume upload cleanup depends on the happy path

The browser uploads a timestamped object before calling `/api/resume/parse`. Uploading a different resume creates another object. `removeFile()` only resets client state; it does not delete the uploaded Storage object.

Current production is clean: five resume objects, none orphaned or unreferenced. But failed parses, abandoned onboarding sessions or repeated replacements can leave objects behind, and there is no per-user object-count quota.

When implementing the Storage/account-lifecycle fixes, delete superseded uploads after a new resume is successfully committed, clean abandoned/orphaned objects safely, and add a practical per-user storage boundary.

## Performance/scalability findings (not current launch incidents)

### 47. Supabase reports multiple unindexed foreign keys on hot-path tables

The performance advisor reports 23 foreign keys without covering indexes. Not every foreign key needs an index, and current production is small, so do not mechanically add all 23.

Prioritize query paths that will grow quickly: `candidate_evaluations(job_id/user_id)`, `engine_tasks(search_id/user_id/opportunity_id)`, `opportunities(search_id/job_id/run_id)`, `rejections(search_id/run_id/job_id)`, `search_runs(search_id)`, `applications(opportunity_id/package_id/job_id)` and activity/evidence relations used by the dashboard/detail pages. Validate with query patterns/EXPLAIN before adding redundant indexes.

### 48. RLS policies repeatedly evaluate `auth.uid()` per row

The Supabase performance advisor flags 22 RLS policies for per-row auth-function evaluation. Supabase recommends wrapping the auth lookup as `(select auth.uid())` so PostgreSQL can use an init plan rather than re-evaluating the function for every row.

This is scale/performance hardening, not a current correctness bug. Apply it opportunistically in the same migration that tightens RLS/grants, then rerun the advisor.

### 49. `startScan()` has a hard 20,000-row pagination ceiling for historical sets

The internal `allRows()` helper stops at 20,000 rows. A long-lived search can eventually accumulate more than 20,000 rejection/evaluation-history rows. At that point older terminal decisions can fall outside the loaded set and jobs may be reconsidered unnecessarily.

Current production is far below the ceiling (largest search has about 3.2k rejections), so this is not launch-blocking today. Replace fixed-history loading with database-side exclusion/pagination or a bounded/current-state model before history approaches that size.

## Verified healthy in the final pass

- Latest production Vercel deployment is `READY` on the Stripe `cancel_at` merge commit.
- `careerely.ai` and `www.careerely.ai` are verified; apex redirects to `www`.
- Current Settings already selects `cancel_at`; the remaining access-state omissions are in other server reads documented earlier.
- Forgot-password uses a generic success message, avoiding obvious account enumeration.
- Recovery links are verified server-side and post-auth redirects are constrained to safe relative paths.
- Password reset globally signs out existing sessions after a successful password change.
- Third-party job links are opened with `noopener,noreferrer`.
- All current engine/internal state tables have RLS enabled. The only public tables with RLS disabled remain the already-documented legacy `cover_letters` and `waitlist` tables.
- Current five confirmed users include no fully onboarded account missing the terms metadata, even though the invariant is still not enforced server-side.
- Service-only RLS tables intentionally have no client policies; that advisor notice is informational rather than a defect.
- Current resume Storage has no orphan objects.

## Audit boundary

Vercel production runtime-error/log queries still return a connector-scope 403. Deployment, domain and environment metadata are readable, so this is an observability-access limitation rather than evidence of an application outage. Restore log access before launch, but do not infer production runtime health from this missing connector permission alone.

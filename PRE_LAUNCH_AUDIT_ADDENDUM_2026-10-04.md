# Careerely pre-launch audit — second-pass addendum — 2026-10-04

This addendum continues the read-only audit recorded in `PRE_LAUNCH_AUDIT_2026-10-04.md`. It is intentionally on the audit branch only. No production fix is implied by this document.

## Additional critical / must-fix finding

### 28. Production dependencies are on versions with known security advisories

The repository currently pins:
- `next` 16.2.4
- `react` 19.2.4
- `react-dom` 19.2.4

As of the audit date, Next.js 16.2.4 is inside multiple published vulnerable ranges, including:
- SSRF/open-redirect behavior in dynamic external rewrites/redirects, fixed in 16.2.11;
- unauthenticated RCE in the AVIF image-optimization path, fixed in 16.3.3;
- RCE in the Node `next/og` `ImageResponse` path, fixed in 16.3.6.

Current Careerely code lowers the immediate applicability of some of those advisories: `next.config.ts` has no dynamic rewrites/redirects, and repository search found no `next/og` or `next/image` usage. That does **not** make remaining on an affected framework version acceptable for launch.

React 19.2.4 is also inside published React Server Components / Server Functions denial-of-service vulnerable ranges. Later 19.2.x security releases exist, and React 19.3.0 is current as of this audit.

Before launch, upgrade Next.js and React/ReactDOM to currently supported patched releases, update the matching `eslint-config-next`, regenerate the lockfile, and run the full typecheck/lint/unit/browser/build suite. Do not choose only the minimum historical patch if a newer supported release is already available; re-check advisories at upgrade time.

## Additional high-priority correctness / security / cost findings

### 29. Evidence verification proves that a quote exists, not that the claim follows from the quote

`verifyEvaluation()` materially improves integrity by requiring `source_text` to be an actual source quote and by rejecting unsupported numeric claims. But it does not verify semantic entailment between a kept quote and the model's `claim`.

A non-numeric unsupported claim can therefore survive if it cites any real quote from the declared source. The same weakness propagates into dimension scoring: a dimension needs valid evidence keys, but the verifier does not prove that the cited evidence actually supports that dimension.

Goal alignment is especially sensitive because it gates ranking regardless of fit score. `verifyEvaluation()` sets `goal.aligned = true` whenever the model returns a `matched_target_role` equal to one of the user's target-role strings. `evaluateCandidate()` then creates a synthetic goal-evidence item from that model-selected role and the posting title. There is no independent semantic test that the job title really is comparable to the target role. A bad model judgment or malicious prompt content can therefore produce a false goal-alignment gate while still looking evidence-backed.

Likewise, `industryMatch` can be accepted with a valid posting quote without proving that the quote actually establishes the claimed industry match.

Strengthen the verifier so the evidence-to-claim relationship is validated, not merely the quote's presence. Goal alignment in particular should be independently constrained/deterministically checked or separately verified before it can gate final rank.

### 30. Package finalization is not atomic and some writes ignore errors

A successful `generatePackage()` finalizes several related records in separate calls:
1. mark `application_packages` ready;
2. mark the opportunity ready;
3. create the application;
4. increment the run's prepared counter;
5. insert the activity event.

Those operations are not atomic. The opportunity update and the activity insert do not check their returned errors at all.

More importantly, once the package is marked ready, a later failure can make retries ineffective. A retry re-enters `generatePackage()`, sees `opp.state !== 'preparing'` if the opportunity was already advanced, and simply returns. That can turn a partially completed finalization into a `done` queue task rather than repairing the missing application/counter/activity state.

Production is currently internally consistent — the audit found no ready package with a wrong opportunity state and no ready package missing its application — so this is a crash/failure-window risk, not a currently observed corruption.

Finalize package + opportunity + application + quota/accounting state atomically where possible, or make every finalization step strongly idempotent and recovery-aware. Never ignore database write errors on state transitions.

### 31. Final lease expiry can bypass queue failure cleanup and orphan application/search state

`handleFailure()` performs important cleanup after a task reaches its final application-level attempt: failed package tasks call `failPackage()`, and failed scan tasks can mark their `search_run` failed.

But `claim_engine_tasks()` has a separate database path for a worker that disappears while holding its **final** lease. On the next claim it directly changes an expired `running` task with `attempts >= max_attempts` to `failed` with `last_error = 'lease expired'`.

That database path does not call `failPackage()` and does not finalize the associated `search_run`.

Therefore a worker timeout/crash on a final attempt can leave:
- an `application_packages` / opportunity pair stuck in `preparing` even though its task is `failed`;
- a `search_run` stuck in `running` even though its task is `failed`.

This is a separate orphan-state path from finding #3's dedupe-key bug. Add reconciliation/cleanup when expired final leases are failed, or redesign task completion so related state is recoverable/idempotent after worker death.

### 32. `startScan()` can leave an orphaned running search run if its start phase fails

`startScan()` inserts a `search_runs(status='running')` row before it loads and processes the full candidate pool. The task payload does not receive that run id until `startScan()` returns successfully.

If any later operation in the start phase fails after the run row is inserted — pool reads, rejection logging, candidate insertion, etc. — the queue's generic failure handler does not know the run id and therefore cannot mark that newly created run failed. A retry of the same task can insert another running run.

The current production audit did not find a stale run, but this is another crash/partial-failure state path. Make run creation/start atomic or persist the run id into recoverable task state before fallible work begins.

### 33. User-facing list loaders can silently hit the Data API's 1,000-row ceiling

The repository Supabase configuration sets `api.max_rows = 1000`.

Several server loaders fetch an owner's complete history without pagination:
- `getLiveOpportunities()` reads all `opportunities` and only afterwards filters dismissed/applied/inactive rows in application code;
- `loadApplications()` reads all `applications` before producing counts and sections;
- `loadSearches()` reads all saved searches.

This is not a current production incident: the audit observed maxima of only 28 opportunities, 8 applications and 3 searches for a single user. But it is reachable by product design. Max allows 200 prepared applications per month, so 1,000 application records can be reached in about five full-quota months, and historical opportunities accumulate faster.

The most dangerous case is `getLiveOpportunities()`: if PostgREST truncates the historical rowset before the application filters old rows, a user's newest/current live opportunities can disappear from Dashboard/Opportunities depending on returned row order.

Push filtering/order into SQL and paginate or intentionally bound historical lists. Do not rely on an unpaged table read remaining complete as accounts age.

### 34. No CAPTCHA/bot boundary protects pre-payment Claude resume parsing

Careerely allows resume parsing before checkout, with a per-account target of 10 parses per 24 hours. Finding #7 already covers the concurrency race inside that per-account limit.

There is also a cross-account abuse problem. The signup client supplies no CAPTCHA token, the repository Auth configuration has CAPTCHA disabled/commented, and the successful production signup smoke test confirms the current flow does not require one. Email confirmation raises friction but does not prevent automated creation of many confirmed/disposable accounts.

An attacker can therefore multiply the pre-payment Claude allowance across accounts. A correct atomic per-user rate limiter alone would not close this cost surface.

Before public launch, add an abuse boundary appropriate for the product — for example Turnstile/hCaptcha at signup and/or the AI parse boundary, a much smaller pre-payment parse budget, and server-side anti-abuse/rate controls. Keep the user experience reasonable, but do not expose an effectively account-multipliable paid AI endpoint.

### 35. Max's “Unlimited searches” makes nightly AI evaluation cost unbounded

The product deliberately makes Max active searches unlimited. The Opportunity Engine evaluates up to 20 candidate postings **per active search per scan**, and the nightly scheduler queues every active search with access. The 10/day Max safety cap applies only to user-triggered immediate scans; nightly scans are excluded.

That means a $79 Max user can legitimately create an arbitrarily large number of active searches and cause an arbitrarily large number of nightly Claude evaluations. Monthly application-preparation quota does not cap evaluation spend.

This is not abuse through a bug — it follows the current entitlement model — but it creates an unbounded unit-economics and denial-of-wallet surface. No current production user is on Max, so there is no observed incident yet.

Preserve the product promise if desired, but introduce a defensible fair-use/engine-work ceiling, deduplicated evaluation reuse, or another cost control that prevents one account from producing unbounded nightly model work.

### 36. Unchanged `not_selected` jobs can be re-evaluated by Claude every scan and can starve the deferred pool

A role that scores at least 60 but ranks outside the top 10 is stored as `candidate_evaluations.status='not_selected'`. The stored row retains its evaluation/result, but `startScan()` does not reuse it and does not skip unchanged `not_selected` rows.

On the next scan the same job returns to the candidate pool. Because the relevance ordering is largely deterministic, the same high-relevance `not_selected` jobs can repeatedly occupy the 20 AI-evaluation slots, get fully re-evaluated, and again finish outside the top 10. This both repeats Claude cost and can prevent lower-ranked deferred jobs from ever reaching evaluation.

The current small production dataset has no retained `not_selected` pair at audit time, so this is a design-path finding rather than an observed repeated charge.

“Competes again next scan” should not require paying for the same unchanged evaluation again. Reuse a prior evaluated result while the input hash is unchanged, mix new/deferred candidates into the evaluation budget, and only re-run Claude when inputs actually changed.

## Additional medium-priority / resilience findings

### 37. First scans and daily scan dedupe use different keys, so one search can scan twice in one UTC day

A first scan uses the permanent dedupe key `scan:<searchId>:first`. Resume/nightly daily protection uses `scan:<searchId>:<YYYY-MM-DD>`.

`startSearchScan(..., 'resume')` checks only the dated key. It therefore does not recognize that the same search already completed its `:first` scan earlier that UTC day.

A newly scanned search can be paused and resumed on the same day and receive another immediate scan if the user still has daily allowance. This is particularly visible for onboarding because the onboarding first scan is intentionally excluded from the user-triggered immediate-scan allowance.

No same-day first+dated scan pair was present in the small production task history at audit time. Still, the implementation contradicts its own “at most once per search per day” comment. Use a per-search/per-day scan guard that includes first scans, while keeping the separate user-level allowance semantics.

### 38. Source deactivation reads are unpaged and one active board is already close to 1,000 jobs

`syncBoard()` upserts fetched jobs in chunks, then queries all currently active stored rows for that provider/slug in one unpaged Supabase read to determine which jobs disappeared.

With the repository Data API ceiling of 1,000 rows, a board with more than 1,000 active stored jobs can leave rows outside that response permanently marked active even after they disappear from the provider.

Production is already near the threshold for one source: the OpenAI Ashby board currently has 828 active jobs; Stripe Greenhouse has 716.

Page the reconciliation read or perform the set reconciliation in a database-side operation that does not depend on the Data API row ceiling.

### 39. A successful-but-empty ATS response can mass-deactivate a healthy board

D8 correctly protects against malformed responses and failed HTTP fetches: failures do not expire the board's jobs. However, an HTTP 200 response with the provider's expected JSON shape and an empty job array is considered a successful fetch.

`syncBoard()` then computes `liveIds = empty` and marks every currently active stored job for that board inactive.

An empty board can be legitimate, so Careerely cannot simply ignore every empty result. But for a board that previously had hundreds of jobs, one anomalous/transient empty payload can hide the entire source at once. Add a cautious source-health transition, confirmation/recheck, or anomaly threshold before mass-deactivating a previously large board.

### 40. A board that becomes permanently `not_found` can leave its previously known jobs marked active

The opposite lifecycle problem is also possible. A 404/410 source is recorded in `source_health` and skipped until its weekly recheck, but the failed fetch deliberately does not call `syncBoard()` deactivation logic.

If a board that used to work later moves ATS or disappears, its old jobs can therefore remain `is_active=true` indefinitely even though Careerely can no longer verify that the board exists. Current production `not_found` rows have no stored jobs, so this is not an active incident today.

Define the desired lifecycle explicitly. A single transient 404 should not mass-delete jobs, but repeated confirmed `not_found` state should eventually mark the board's listings unavailable/stale so users are not shown unverifiable opportunities forever.

## Audit notes extending existing findings

### Finding #6 — direct dismiss-state bypass

Authenticated users have direct column-level UPDATE access to `opportunities.dismissed_at`, `dismiss_reason` and `dismiss_note`. The API route only permits dismissal while an opportunity is `shortlisted` and restricts the reason to the supported enum, but direct Data API writes can bypass those route-level rules. This belongs in the broader “server validation can be bypassed through direct PostgREST writes” remediation.

### Finding #26 — relational deletion coverage is good; Storage and Stripe still need an explicit workflow

Production foreign keys from the user-owned Careerely relational tables to `auth.users` are overwhelmingly configured `ON DELETE CASCADE`. So an Auth-user deletion already has a strong foundation for relational cleanup.

The remaining operational gap is important: Storage objects are not automatically deleted by those database cascades, and Stripe is an external system. An account-deletion workflow should therefore clean up owned Storage objects, cancel/reconcile the Stripe customer/subscription as required, then delete the Auth user and verify completion. Current production has no orphan resume Storage objects.

## Additional verified-healthy observations

- Current package/opportunity/application state is internally consistent: no ready package has the wrong opportunity state, no preparing package has the wrong opportunity state, and no ready package is missing its application.
- Current production has no same-day `:first` + dated scan pair in the small task history.
- Current `source_health` `not_found` boards have no stored jobs, so the stale-active scenario in finding #40 is not presently affecting users.
- Current resume Storage contains five objects and none is orphaned from an Auth user.

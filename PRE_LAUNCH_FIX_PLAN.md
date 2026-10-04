# Careerely pre-launch fix plan — 2026-10-04

This plan converts the read-only audit into ordered implementation batches. It lives on `chatgpt/security-hardening`; nothing here is deployed by creating this file.

## Batch 1 — Security/data exposure (do first)

1. Lock down legacy public tables `cover_letters` and `waitlist`: enable RLS/revoke client SELECT or archive/drop after confirming no dependency.
2. Revoke `PUBLIC`/`anon`/`authenticated` EXECUTE from engine/internal SECURITY DEFINER RPCs (`claim_engine_tasks`, `reserve_preparations`, `record_prepared`, `preparations_used`, `current_plan`, trigger helpers as appropriate). Keep only intended user-facing RPCs available. Constrain any self-service access helper to `auth.uid()` semantics.
3. Close direct PostgREST bypasses for sensitive Search/Career Profile/Profile state. Mirror shape constraints in DB and/or move sensitive writes behind validated RPC/API boundaries. Normalize/bound engine context at the engine boundary.
4. Add signup/pre-payment AI abuse protection (CAPTCHA/Turnstile and a stricter pre-payment parse budget / server-side anti-abuse controls).
5. Enable Supabase leaked-password protection.
6. Upgrade Next/React/ReactDOM/eslint-config-next to patched supported versions and run the full suite.

## Batch 2 — Core correctness / state integrity

7. Fix package preparation dedupe so a retried/new package reservation always gets a valid task; repair existing stuck packages only after the code fix.
8. Make package finalization atomic or fully idempotent/recoverable. Check every DB write error.
9. Reconcile final lease expiry with package/search cleanup so final expired tasks cannot orphan `preparing` packages or `running` search runs.
10. Make `startScan()` recoverable if failure occurs after a run row is created.
11. Include `cancel_at` everywhere subscription access state is loaded (`write-access`, dashboard/account, onboarding completion, checkout, etc.).
12. Make canonical My Pick exclude submitted/hidden/inactive opportunities or derive it rather than persisting divergent state.
13. Re-evaluate prior rejections when resume/search/posting inputs change instead of treating stale rejections as permanent.
14. Reuse unchanged `not_selected` evaluation results; do not pay Claude again for unchanged input hashes, and avoid starvation of deferred candidates.
15. Make active-search plan enforcement concurrency-safe per user.
16. Make first-scan and daily scan dedupe share a per-search/per-day guard while keeping allowance semantics separate.

## Batch 3 — Matching quality / product correctness

17. Fix work-style truth table for all allowed combinations, not only remote-only.
18. Model remote geography separately from work style so `Remote - USA` is not globally compatible.
19. Treat compensation as comparable only when annual interval is known. Fix Greenhouse hourly/malformed ranges and preserve unknown-not-negative behavior.
20. Strengthen evidence verification from quote-presence to claim support/entailment; independently constrain goal alignment before it can gate rank.
21. Strengthen package grounding so non-numeric invented skills/tools/employers/achievements cannot pass with unrelated evidence IDs.
22. Add explicit prompt-injection instructions to resume, evaluation and package prompts while keeping deterministic verification as the backstop.
23. Decide and enforce one total package-generation attempt budget so retry layers do not accidentally multiply Claude calls.

## Batch 4 — Billing / cost control

24. Make Checkout creation idempotent and guard pending checkout/customer creation races; define duplicate-live-subscription reconciliation.
25. Add a bounded fair-use/engine-work control for Max so “Unlimited searches” cannot mean unbounded nightly model spend.
26. Verify Stripe portal plan switching, proration, downgrade-at-period-end and cancellation behavior in sandbox after code fixes.
27. Only after final smoke testing, replace all production Stripe sandbox/test credentials, prices, webhook secret and portal configuration with LIVE equivalents.
28. Enable Anthropic balance/auto-reload monitoring before launch.

## Batch 5 — ATS/source resilience

29. Page source reconciliation reads so boards over 1,000 active jobs deactivate correctly.
30. Add anomaly protection for a sudden successful-but-empty board before mass-deactivation.
31. Define repeated `not_found` lifecycle so formerly-live boards eventually mark unverifiable jobs stale/inactive after confirmation.
32. Replace dead board slugs over time; coverage improvement, not a launch-stability blocker.
33. Clean duplicate `jobs.dedupe_key` groups if still useful after matching fixes.

## Batch 6 — Account/privacy / operational launch

34. Implement or document an account-deletion workflow covering Storage, Stripe and Auth; relational cascades already provide a good foundation.
35. Enforce mandatory Terms acceptance as an account/onboarding invariant rather than trusting client metadata alone.
36. Put a practical per-user resume Storage object/quota policy in place and clean superseded uploads.
37. Add extraction complexity/decompression/page/text ceilings before AI parsing.
38. Push historical-list filtering into SQL and paginate/bound Opportunities, Applications and Searches so PostgREST's 1,000-row ceiling cannot truncate active data.
39. Reconcile Supabase migration history before adopting automated migration deployment.
40. Add CI and protect `main` with required checks once this fix series is stable.
41. Restore reliable production runtime-log access/observability and remove confirmed-unused Vercel env variables after dependency review.

## Final-pass additions to fold into the batches

### Security/configuration — fold into Batch 1 and the final launch cutover

- **Separate Preview from Production secrets before LIVE Stripe cutover.** Vercel currently scopes `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `ANTHROPIC_API_KEY` to both Preview and Production. Production must get LIVE Stripe credentials only; Preview must stay on sandbox/test Stripe. Prefer a separate Preview Anthropic key/budget as well.
- **Harden mutable function search paths.** Set an explicit safe `search_path` for `set_updated_at`, `plan_limits` and `immediate_scan_limit` while doing the RPC/grant migration.
- **Classify advisor warnings rather than blindly changing them.** Service-only RLS tables with no client policies are intentionally closed; keep them closed.

### Engine correctness/cost — fold into Batch 2

- **Bound failed-evaluation retries per input hash.** Production already shows an unchanged job failing structured-output validation on consecutive nights. After a small retry budget, quarantine it until resume/search/posting inputs change instead of spending one of the 20 AI slots forever.
- **Remove the fixed 20,000-history assumption before scale.** `startScan()` should not silently forget older terminal decisions once a search accumulates more than the helper's hard cap.

### Privacy/storage/legal — fold into Batch 6

- **Make product behavior match the legal promises.** Terms say a user can delete their account at any time; Privacy says deletion/data-rights can be exercised through Settings or support. Implement the workflow or revise the copy before public launch.
- **Clean superseded/abandoned resume uploads.** The current browser flow uploads timestamped objects before parsing, while UI “remove” only clears local state. Production is clean today, but failed/abandoned/replaced uploads can accumulate.

### Performance — address while touching the same schema, but do not block the current audit on every lint

- Review the 23 unindexed foreign keys and add covering indexes to actual hot paths first (`candidate_evaluations`, `engine_tasks`, `opportunities`, `rejections`, `search_runs`, `applications`, activity/evidence joins) after checking query patterns.
- Rewrite the 22 RLS policies flagged for repeated `auth.uid()` evaluation to use the recommended init-plan form `(select auth.uid())` when those policies are next migrated.
- Do not remove the three currently-unused indexes solely because production is tiny and young; re-check usage after realistic traffic.

## Recommended implementation order

Do not merge one giant change. Use small PRs with production-safe migrations and rollback/recovery notes:

- PR A: security grants/RLS + DB constraints + function search-path hardening
- PR B: package queue/finalization/recovery + failed-evaluation retry policy
- PR C: scan/rejection/evaluation reuse + concurrency guards
- PR D: work style/location/compensation correctness
- PR E: AI grounding/prompt hardening/cost limits
- PR F: Stripe checkout/access consistency + Preview/Production secret separation plan
- PR G: source ingestion resilience
- PR H: auth/storage/privacy/deletion + legal-copy reconciliation
- PR I: dependency upgrades + CI/branch protection + targeted DB performance indexes/RLS init-plan cleanup
- Final: sandbox smoke suite, isolate Preview from LIVE credentials, then LIVE Stripe cutover and launch checklist

User-facing design/UI changes are intentionally excluded from this technical plan and can be handled in the final UI round.
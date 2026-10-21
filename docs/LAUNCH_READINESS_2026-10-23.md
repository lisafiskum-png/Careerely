# Careerely launch readiness — 23 October 2026

This is the release record for the first public Careerely launch. A row is only
`VERIFIED` when its evidence is reproducible in production. Code completion by
itself is not production verification.

## Release rule

- `P0`: blocks launch.
- `P1`: fix before broad public launch, or disclose and deliberately phase the rollout.
- `P2`: may follow after launch if monitored and documented.
- `BLOCKED`: needs an external service, owner decision, payment, or legal review.

## Current blockers

| Capability | Severity | Status | Evidence / next gate |
|---|---:|---|---|
| New customer checkout | P0 | BLOCKED | Requires restored database plus an explicitly approved Stripe test/live transaction. Verify signup → checkout → webhook → subscription → welcome email → dashboard. |
| AI matching and application generation | P0 | BLOCKED | Anthropic credits unavailable. After funding, run controlled generation and retry only eligible failed tasks. |
| Legal entity and consumer terms | P0 | BLOCKED | Owner/legal professional must supply the contracting entity name, registration number and business address, and review Norway/EU/UK withdrawal, refund, tax and governing-law wording. Do not claim legal approval before that review. |
| Supabase leaked-password protection | P1 | VERIFIED | Enabled in production on 21 October 2026. The follow-up Security Advisor run no longer reports the leaked-password warning. |

## Verified in code and CI

| Capability | Severity | Status | Evidence |
|---|---:|---|---|
| Login vs. new-user routing | P0 | VERIFIED | Existing users receive the login form; onboarding guards and auth-routing tests prevent completed users being sent back into onboarding. |
| Password reset | P0 | VERIFIED | Recovery callback, update-password screen, expired-link handling and post-change security notification are implemented and tested. |
| Account deletion | P0 | VERIFIED | Requires current password and explicit `DELETE`; billing is stopped, private files are removed, then Auth deletion cascades account data. |
| Personal-data export | P1 | VERIFIED | Settings download produces a non-cacheable JSON export under user RLS; internal Stripe identifiers are excluded. Unit tests cover complete and failed exports. |
| Subscription email idempotency | P0 | VERIFIED | Stripe event ID is used as the Resend idempotency key; webhook retries cannot duplicate the paid welcome email. |
| Queue outage behavior | P0 | VERIFIED | Database outages return machine-readable retryable `503`, not false success. Queue is currently empty rather than growing during the outage. |
| Vercel → Supabase Data API | P0 | VERIFIED | After the Pro upgrade, production health returned `200` with database/queue OK, zero claimable tasks, zero stale runs and zero expired leases. Direct SQL also succeeded. |
| AI claim traceability | P0 | VERIFIED | Match claims require stored job/resume evidence; unsupported numbers are removed and inferred claims are labelled. |
| SerpApi launch state | P0 | VERIFIED | SerpApi remains deliberately OFF. |
| Terms acceptance | P1 | VERIFIED | Signup records an explicit acceptance timestamp and links both Terms and Privacy Policy. |
| Privacy controls | P1 | VERIFIED | Private Storage, RLS, account deletion and data export are available. Policy identifies production processors and describes cookie-free Vercel analytics accurately. |
| Global onboarding taxonomy | P1 | VERIFIED | Broad role/industry/location starters are present and custom values are allowed; lists are helpers, not whitelists. |
| Vulnerability contact | P1 | VERIFIED | `/.well-known/security.txt` publishes the monitored support/security address and is covered by production smoke tests. |
| Operational incident handling | P1 | VERIFIED | `docs/OPERATIONS_RUNBOOK.md` covers health, queue, AI, billing, auth/email, privacy/security, rollback and support procedures. |
| Honest global scope | P1 | VERIFIED | `docs/GLOBAL_CAPABILITY_MATRIX.md` labels industry, country, language, discovery and commercial coverage without claiming untested support. |

## Documented non-blocking risks

- `npm audit --omit=dev` reports the moderate `sprintf-js` precision DoS
  advisory through Mammoth's command-line-only `argparse` dependency. Careerely
  imports Mammoth's library API, not its CLI or attacker-controlled format
  strings. The advisory has no patched `sprintf-js` release, and npm's proposed
  fix is a breaking downgrade of the resume parser. Keep the upload size/ZIP
  limits in place, monitor the upstream dependency, and upgrade when a safe
  patched release exists.

## Production gates still to run

1. Existing paid user: login → dashboard, with no onboarding or payment prompt.
2. Brand-new address: signup → resume → review → preferences → plan → checkout → email → dashboard.
3. Password reset using a newly issued link; old link must fail safely.
4. Customer Portal: invoice history, update payment method, upgrade/downgrade and cancel-at-period-end.
5. Account export and deletion against a disposable paid test account.
6. Engine tick, source sync, search scan and queue retry/backoff while monitoring queue depth.

Production evidence on 21 October 2026: health is OK; there are zero queued,
running, or expired-lease tasks; four searches completed successfully in the
last 24 hours. Recent failures are controlled source `not_found` outcomes plus
two AI package failures while the provider remains blocked.

## Global capability statement

| Area | Launch status | Honest scope |
|---|---|---|
| Onboarding profiles | SUPPORTED | Users may enter roles, industries and locations worldwide. |
| Static ATS discovery | PARTIALLY SUPPORTED | Coverage depends on configured employers and their ATS feeds; it is not comprehensive global job-board coverage. |
| SerpApi global discovery | DISABLED | Deliberately off until cost, terms, quality and reliability are approved. |
| Resume parsing | PARTIALLY VERIFIED | Deterministic fallback prevents provider outages from stranding text-based resumes; multi-language/format persona QA remains. |
| AI matching/documents | BLOCKED | Cannot be verified until Anthropic credits are restored. |
| Billing currencies/tax | PARTIALLY SUPPORTED | Current storefront displays USD; Stripe tax/currency/legal configuration still requires owner verification. |

## Final release decision

**Current decision: NO-GO for public paid launch.** Database connectivity is
restored, but the paid checkout and AI generation workflow still lack complete
production evidence. This changes to GO only after every P0 blocker above has
that evidence.

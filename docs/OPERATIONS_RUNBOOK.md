# Careerely production operations runbook

This runbook covers launch-critical incidents. It deliberately avoids customer
document contents and secret values. Production access should follow least
privilege and every manual data change must be attributable.

## Service checks

1. Check `https://www.careerely.ai/api/health`. Healthy means HTTP 200 with
   `status`, `database`, and `queue` all `ok`.
2. Confirm the production Vercel deployment is `READY` and its commit matches
   `main`.
3. Check Supabase project health and the most recent Cron runs.
4. Check queue totals by status and distinguish current failures from historical
   rows. Never bulk-retry tasks before classifying their failure.

The scheduled GitHub production-health workflow checks the database and queue
every 15 minutes. The production-smoke workflow verifies the public journey in
desktop Chrome, mobile Chrome, and mobile Safari after each release and daily.

## Queue or job-source incident

- User scans and package work have priority over source refreshes.
- An expired lease is recoverable; do not delete the task.
- A 404/410 source is a permanent `not_found` failure and is paused for seven
  days. Do not retry it repeatedly.
- Rate limits, provider errors, timeouts, and network failures use bounded
  retries and a temporary pause.
- If claimable tasks grow for two consecutive checks, pause new source fan-out,
  preserve user tasks, inspect the first current error class, then deploy a
  targeted fix.

## AI provider incident

- Do not retry all historical AI failures.
- Confirm provider credits and credentials without logging their values.
- Run one controlled generation for a disposable test account.
- Verify factual traceability and both document downloads.
- Retry only tasks that are still relevant, owned by an active user, within
  plan limits, and failed for a transient provider reason.

## Billing incident

- Stripe is the billing source of truth; the webhook is the only normal writer
  of subscription state.
- Check webhook signature failures, event delivery attempts, and the stored
  Stripe event id before replaying an event.
- Never edit a live subscription or issue a charge/refund without founder
  approval.
- If checkout succeeds but access is missing, re-read the subscription from
  Stripe and reconcile that single customer. Do not grant access by manually
  setting an arbitrary status.

## Authentication or email incident

- Confirm Supabase Auth health and Resend delivery state.
- Do not reveal whether an email address has an account.
- Recovery links are single-use and expire; issue a new link instead of trying
  to revive an old token.
- Never request a password or one-time code through support email.

## Privacy or security incident

1. Preserve logs and timestamps; do not copy resume contents into tickets.
2. Contain the affected credential, route, integration, or account.
3. Determine affected users, data categories, countries, and time window.
4. Notify the founder immediately. Obtain qualified privacy/legal advice for
   breach-notification deadlines and regulator/customer communication.
5. Rotate exposed secrets, invalidate sessions where relevant, deploy the fix,
   and document the evidence of recovery.

Vulnerability reports go to `hello@careerely.ai` and are advertised at
`/.well-known/security.txt`.

## Deployment and rollback

- A release needs CI, Vercel `READY`, `/api/health`, and production smoke tests.
- Roll back to the last known-good Vercel deployment if a release breaks a P0
  journey. Database migrations must be forward-compatible; never use a
  destructive rollback without a reviewed recovery plan and backup.
- After rollback, verify login, health, checkout entry, and queue recovery.

## Support handling

- Account recovery: verify ownership through the existing Auth flow, not by
  collecting identity documents over email.
- Billing: use Stripe Customer Portal for payment method, invoice, plan, and
  cancellation actions.
- Privacy: direct users to Settings for export/deletion or process a verified
  request sent to `hello@careerely.ai`.
- Bugs: record time, page, safe reproduction steps, and request ID if present;
  do not request passwords, payment details, or complete resumes.

# Launch verification — 8 October 2026

This file distinguishes implemented safeguards from checks that still need real
external-service access. It is not a claim that Careerely is ready for public launch.

## Confirmed in production

- PR #36 is merged. Main CI and the Vercel deployment check passed.
- The `engine_self_healing` migration is applied. Worker claims are executable
  by `service_role`, not by `anon` or `authenticated`.
- No search run older than the ten-minute lease was still running at inspection.
- The engine cron is active every minute. All 359 retained HTTP responses from
  the preceding six hours were HTTP 200 without timeout.
- Production Chrome/Pixel and WebKit/iPhone smoke checks passed all four tests
  on the previous main deployment. These cover public entry points, overflow,
  legal pages and database/queue health; they do not prove a paid user journey.
- Landing-page Log in opens the email/password form. Registration has its own
  entry point. The demo is labelled illustrative and uses fictional companies.
- Resume and document buckets are private.
- The authenticated SECURITY DEFINER RPCs reported by the advisor were reviewed:
  application mutations check ownership and subscription access, the notice
  mutation uses `auth.uid()`, and subscription lookup rejects another user's ID.
  Their intentional client access must not be revoked merely to remove warnings.

## This follow-up change

- Auth outages and rate limits are distinguished from invalid credentials.
- Login, signup, email resend and password recovery restore their controls after
  failed requests. A failed recovery-session check can be retried.
- Account-deletion failure copy describes possible partial completion.
- Health exposes the non-sensitive Git commit SHA. Push-triggered production
  smoke tests wait for that SHA instead of accepting an older healthy build.
- Auth-error browser tests intercept Auth calls: no actual emails, accounts,
  password updates or charges are produced. Browser reports are kept for seven days.

## Remaining external verification

- Stripe live price/product configuration, webhook deliveries, portal settings,
  upgrades, cancellation and one complete live checkout. A stored active row or
  an earlier test payment is not evidence of all of these.
- Custom Supabase SMTP, branded templates, external confirmation/reset delivery,
  and an operational, monitored `hello@careerely.ai` mailbox.
- Enable Supabase leaked-password protection. Dashboard sign-in is required;
  changing the owner's password is not part of this task.
- Complete the actual confirmed-email → resume → preferences → paid checkout →
  dashboard journey and subsequent existing-account login. An unpaid account
  must stay outside the app; a previously onboarded account must not restart it.
- Owner confirmation of legal company identity, address/registration details,
  processor agreements and the privacy/terms text. Do not invent these details.
- Verify delivery of production failure notifications to the operator; a failed
  GitHub workflow alone does not prove that the operator receives a notification.

## Explicitly deferred

- Anthropic credits, real document generation and controlled retry of its failed tasks.
- SerpApi activation. It remains disabled and is not a launch requirement.

# Careerely

Careerely is an AI career agent. The user uploads a resume; Careerely finds,
evaluates and prioritises jobs, prepares a tailored resume and cover letter for
the best ones, and the user reviews and applies.

The **Careerely Master Brief** is the source of truth for product, pricing, copy
and design.

## Stack

- Next.js 16 (App Router) on Vercel Pro
- Supabase: Postgres, Auth, Storage
- Stripe subscriptions: Basic $29 / Pro $49 / Max $79 per month
- Claude API (`claude-sonnet-4-6`)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Apply the database schema before first use; see [`supabase/README.md`](supabase/README.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests plus the database access-rule tests (in-memory Postgres) |
| `npm run test:e2e` | Full onboarding journey in a browser (see below) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run remediate:reevaluate -- <opportunity-id>... [--apply]` | Re-evaluates prepared opportunities with the current evidence rules and regenerates their packages in place (dry run without `--apply`) |

## Layout

- `app/`: pages and API routes
- `proxy.ts`: refreshes the Supabase session and keeps signed-out users out of `/dashboard`
- `lib/auth.ts`: `requireUser()` for API routes (user id always comes from the session)
- `lib/supabase/`: browser, server (user session) and admin (service role) clients
- `lib/plans.ts`: plans, limits and access rules (mirrored in the database)
- `lib/billing.ts`, `lib/stripe.ts`: Stripe subscription sync
- `lib/engine/`: Opportunity Engine (see below)
- `app/(app)/`: signed-in app: top-bar shell and Dashboard (`app.css` ports
  `design/dashboard-final.html`); `lib/dashboard.ts` and
  `lib/opportunity-detail.ts` read the stored data it shows
- `supabase/migrations/`: database schema and row level security
- `tests/`: Vitest suites

## End-to-end tests

`npm run test:e2e` runs signup → email confirmation → resume upload and review
→ preferences → checkout → first search → dashboard, and password reset, in
Chromium against the real app. It needs:

```bash
npx supabase start                                        # local Supabase + mail inbox
docker run -d -p 12111:12111 stripe/stripe-mock           # Stripe API stand-in
```

The Claude API is replaced by `e2e/mock-anthropic.mjs`, and the Stripe-hosted
checkout page is simulated by the test (payment succeeds, the webhook's
subscription row is written, Stripe redirects back).

## Dashboard (Phase D)

`/dashboard` follows `design/dashboard-final.html` (locked). Every number and
claim comes from stored data: counts from the user's live opportunities and
applications, "reviewed in latest scan" and "last scan" from the latest
completed `search_runs` row, evidence and reasoning from the engine's records.
The opportunity panel (`/api/opportunities/[id]`) shows Summary (Why I picked
this · What Careerely changed · Things I considered), Resume, Cover letter and
The role. Actions: "Not for me" with an optional reason (Shortlisted only,
enforced in the database), "Continue to application" then "Did you apply?",
and PDF downloads of the prepared documents.

`/opportunities` (Phase D3) lists every live opportunity in stored rank order:
My Pick featured, then "Also shortlisted", each with its match % and two
primary evidence points, using the same panel. Dashboard and Opportunities
leave out dismissed and applied opportunities and postings no longer listed
on their board (nothing is changed; a relisted posting reappears).

`/applications` (Phase D4) shows "Ready to apply" (stored rank order) and
"Your applications" (Offer, Interview, Applied, then closed; most recent update first), with the
summary "N prepared · N applied · N interviews" from stored rows. Status is
tracked manually: Applied / Interview / Offer, closed as Declined /
Withdrawn (choosing a stage reopens). Only "Yes, I applied" moves an
application out of Ready to apply; it never goes back (enforced in the
database). Each change is an `application_status_changed` activity event,
which is the panel's timeline and appears in Recent activity.

`/searches` (Phase D5) shows each search with its parameters and, from its
latest completed scan, "Reviewed in latest scan" and "Shortlisted in latest
scan" (never summed or live counts), plus the plan's active-search usage
(limit from `lib/plans.ts`, enforced in the database). Users create, edit,
pause and resume searches; there is no delete in V1. At the limit a new
search can only be saved as paused, and Resume is refused until another
search is paused. A new active search is scanned straight away; a resumed one
too, at most once per search per day (shared with the nightly dedupe key);
an edit applies from the next nightly scan. A search's optional minimum
compensation is annual (whole number, up to 10,000,000) and has its own ISO 4217
currency (`searches.compensation_currency`), compared only with salaries in the
same currency (no conversion);
when blank, the engine uses the Career Profile's minimum only if it has both
an amount and a currency, otherwise there is no minimum. The nav's
"Scanning the market" only counts scans of searches that are active now.

`npm run test:e2e` includes `e2e/dashboard.spec.ts`, `e2e/opportunities.spec.ts`, `e2e/applications.spec.ts` and `e2e/searches.spec.ts`, which seed a local
account; set `SCREENSHOT_DIR` to save desktop and mobile screenshots.

## Onboarding

- `/signup` (Step 1, optional `?plan=basic|pro|max`), `/login`,
  `/forgot-password`, `/reset-password`, `/auth/confirm` (email links)
- `/onboarding` sends the user to the step to continue from
- `/onboarding/2`: upload → parsing (`/api/resume/parse`) → review
  (`/api/resume/confirm`)
- `/onboarding/3`: preferences; "Find my matches" calls
  `/api/onboarding/complete`, which asks for checkout when there is no active
  subscription and creates the first search once there is

## Opportunity Engine (Phase C)

Implements `OPPORTUNITY_ENGINE_SCHEMA.ts`. Code in `lib/engine/`:

| Stage | Where | What |
|---|---|---|
| Sources | `companies.ts`, `sources.ts`, `ingest.ts` | Greenhouse, Lever and Ashby company boards only; postings no longer listed become inactive |
| 1 Hard filter | `filter.ts` | Deterministic: expired, duplicate, location, compensation floor, role category. Unknown never rejects |
| 2 Relevance | `evaluate.ts`, `verify.ts` | Claude evaluates requirements; only verbatim-quoted evidence is kept |
| 3 Scoring | `scoring.ts` | Weighted dimensions; dimensions without evidence are left out; shortlist at ≥ 60, max 10 per search per night |
| 4 Ranking | `scoring.ts`, `scan.ts` | Goal-aligned (matches a Step 3 target role) always above non-aligned; then industry, score, recency; rank 1 = My Pick |
| 5 Evidence | `scan.ts`, `text.ts` | Evidence records stored; every claim points to them. A quote must match whole words within one line, bullet or resume field. Audit stored evidence with `supabase/audit/evidence_traceability.sql` |
| 6 Preparation | `prepare.ts` | Top 2 per nightly run, within the plan's monthly allowance (reserved atomically in the database) |
| 7 Package | `prepare.ts` | Tailored resume changes + segmented cover letter, fact-checked, regenerated once if a check fails |

Every evaluated posting ends in one of four outcomes. **Shortlisted** becomes
an opportunity. **Rejected** gets a `rejections` row: failed Stage 1, or scored
below 60. Two outcomes are not rejections and are kept on
`candidate_evaluations` with a reason:

- `not_selected`: scored ≥ 60 but fell outside the run's top 10. It competes
  again in the next scan.
- `unevaluable`: too little traceable evidence to score. Its fit is unknown,
  not low. It is evaluated again once the resume, the search or the posting
  changes.

Scheduling: Vercel Cron calls `/api/engine/tick` (`vercel.json`). While the
project is on Vercel Hobby, which only allows daily crons, the schedule is
`0 2 * * *` (once a day, 02:00 UTC, matching `ENGINE_NIGHTLY_HOUR_UTC`). On
Vercel Pro, set it back to `*/5 * * * *` so the queue is worked every 5 minutes.
Each tick queues the nightly run when due and works through `engine_tasks`
for up to 4 minutes. Finishing onboarding queues the user's first scan
immediately. `npm test` includes an end-to-end engine run against the local
Supabase stack when it's running.

## Stripe webhook

Point a Stripe webhook at `/api/stripe-webhook` with these events:
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`customer.subscription.paused`, `customer.subscription.resumed`.

## Settings and billing (Phase D6)

`/settings` shows the current plan with its entitlements from `lib/plans.ts`
(no price: amounts, currency, tax and proration live in Stripe), the renewal or
end date stored from Stripe, the account email and Sign out. "Manage billing"
(`POST /api/billing/portal`) opens Stripe's Customer Portal for the signed-in
user's stored Stripe customer (never taken from the request) and returns to
`/settings`. It is shown whenever a Stripe customer exists, so former
subscribers can still see invoices. Accounts without access keep the existing
read-only rules and can subscribe again through Checkout.

Downgrades: the stored plan comes from the subscription's current item, so a
downgrade scheduled for the period end changes nothing until it takes effect.
After every sync, `public.apply_plan_search_limit()` pauses only the active
searches above the new limit (the search created from preferences is kept
first, then the oldest by `created_at`, then `id`), sets
`searches.paused_by_plan_change_at`, and queues no scans. It is idempotent, and
an upgrade never resumes anything. The marker is server-controlled provenance
(users can't set or clear it); only a search becoming active again (the user
resuming it) clears it. Searches names the paused searches and Settings says
searches were paused; "Dismiss" calls `public.dismiss_plan_change_notice()`,
which only sets `profiles.plan_change_notice_dismissed_at` (notices show
searches paused by a plan change after that time) and changes no search.

### Stripe Dashboard: Customer Portal configuration (required)

Settings → Billing → Customer portal, default configuration:

- **Business information:** set the return/redirect and terms links; the app
  passes `return_url = <NEXT_PUBLIC_APP_URL>/settings` on each session.
- **Customer information:** allow updating email/billing address as you prefer
  (Careerely's sign-in email is separate and is not changed by Stripe).
- **Payment methods:** allow customers to update payment methods.
- **Invoice history:** on.
- **Cancel subscriptions:** on, **at the end of the billing period** (not
  immediately). Optional cancellation reasons are fine.
- **Subscriptions → Customers can switch plans:** on, with the Basic, Pro and
  Max products and exactly the prices used in `STRIPE_PRICE_BASIC`,
  `STRIPE_PRICE_PRO` and `STRIPE_PRICE_MAX` (one monthly price each). Quantity
  changes off.
- **Proration:** upgrades take effect immediately and are prorated
  ("Prorate charges and credits", invoiced immediately).
- **Downgrades:** "When customers downgrade, update at the end of the billing
  period" (Stripe schedules the change; the current plan and limits stay in
  force until then).
- Make sure the webhook above is subscribed to `customer.subscription.updated`
  and `customer.subscription.deleted`, which carry portal changes.

## Signed-in actions (Phase D7)

Every signed-in action is an API route under `app/api/` that takes the user
from the session, never from the request. Ownership is enforced by row level
security: another user's opportunity, application or search is "not found"
(404) and unchanged. Writes by read-only accounts all return
`403 { error: 'Your account is read-only.', code: 'read_only' }`
(`lib/write-access.ts`, the canonical access rule; RLS remains the backstop).
Reading, PDF downloads and Manage billing stay available to read-only
accounts. Signed-out requests get 401. After each action the page refreshes
its server data, so nav badges, Dashboard, Opportunities, Applications and
Searches agree. `e2e/access.spec.ts` covers these rules across all actions.

# Careerely

Careerely is an AI career agent. The user uploads a resume; Careerely finds,
evaluates and prioritises jobs, prepares a tailored resume and cover letter for
the best ones, and the user reviews and applies.

The **Careerely Master Brief** is the source of truth for product, pricing, copy
and design.

## Stack

- Next.js 16 (App Router) on Vercel (Hobby); engine ticks from Supabase Cron
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
an edit applies from the next nightly scan. Immediate scans from these Search
actions also have a per-user safety cap per UTC day (Basic 1, Pro 5, Max 10;
`IMMEDIATE_SCANS_PER_DAY`, enforced by `public.claim_immediate_scan()`), not
shown as a plan entitlement. Over the cap the search is still saved or
resumed and active, nothing is queued, and the page says its scan "will run
at the next nightly run" (a never-scanned card shows "First scan at next
nightly run"; "First scan queued" only when a scan task really exists).
Onboarding's first scan and nightly scans don't use the cap. A search's optional minimum
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

Scheduling: the engine is built around repeated ticks of
`GET /api/engine/tick` (with `Authorization: Bearer <CRON_SECRET>`), every 5
minutes in production. Each tick queues the nightly run when it's due (02:00
UTC, `ENGINE_NIGHTLY_HOUR_UTC`) and works through `engine_tasks` for up to 4
minutes, so syncs, the scans queued 30 minutes later, preparation decisions
and packages complete over the following ticks. Production stays on Vercel
Hobby, so the ticks come from **Supabase Cron**, not Vercel Cron (there is no
`vercel.json` cron). User actions (onboarding, new or resumed searches) also
start the worker straight away.

### Supabase Cron setup (production, once)

The secret lives in Supabase Vault, never in this repository, in SQL you
save, or in the cron job's command text.

1. **Choose the secret.** Generate a long random value (for example
   `openssl rand -hex 32`). In Vercel → Project → Settings → Environment
   Variables, set `CRON_SECRET` to it for Production, then redeploy so the
   tick endpoint uses it.
2. **Enable the extensions.** Supabase Dashboard → Integrations → **Cron**:
   enable it (installs `pg_cron`). Database → Extensions: enable **pg_net**.
   Vault (`supabase_vault`) is enabled on every Supabase project.
3. **Store the secret in Vault.** Dashboard → Integrations → **Vault** → Add
   new secret: name `careerely_cron_secret`, value = the same value as
   `CRON_SECRET`. (Using the Vault screen keeps the value out of SQL editor
   history.)
4. **Schedule the job.** In the SQL editor, run:

   ```sql
   select cron.schedule(
     'careerely-engine-tick',
     '*/5 * * * *',
     $$
     select net.http_get(
       url := 'https://www.careerely.ai/api/engine/tick',
       headers := jsonb_build_object(
         'Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'careerely_cron_secret')
       ),
       timeout_milliseconds := 300000
     );
     $$
   );
   ```

   The command only references the Vault secret by name; the value is read at
   run time. Use the exact production host (`https://www.careerely.ai`) so no
   redirect drops the header. The 300 s timeout matches the tick's
   `maxDuration` (the worker itself stops after 4 minutes).
5. **Verify** (a few minutes later):

   ```sql
   select jobid, jobname, schedule, active from cron.job;
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   select status_code, error_msg, created from net._http_response order by created desc limit 5;
   ```

   Expect `succeeded` runs and HTTP `200` responses (a JSON body like
   `{"processed":…,"failed":…}`). `401` means the Vault secret and Vercel's
   `CRON_SECRET` differ. Vercel → Logs shows the matching `/api/engine/tick`
   requests every 5 minutes.
6. **Rotate the secret:** set the new value in Vercel and redeploy, then
   update it in Vault (Integrations → Vault → edit `careerely_cron_secret`).
   Ticks in between return 401 and are simply retried 5 minutes later.
7. **Pause or remove:** `select cron.unschedule('careerely-engine-tick');`

On Vercel Hobby the tick's `maxDuration = 300` needs Fluid compute (on by
default for new projects; Vercel → Project → Settings → Functions). Finishing onboarding queues the user's first scan
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

Application status changes are atomic with their history: the activity rows
are both Recent activity and the panel's Timeline, so
`public.mark_application_applied()` ("Yes, I applied": Applied plus exactly
one `application_applied` event) and `public.set_application_status()` (a
stage or closed outcome plus exactly one `application_status_changed` event)
write the change and its event in one transaction, for the signed-in user's
own application and only with an active plan. Signed-in users can't update
the status columns directly.

## Launch hardening and production smoke test (Phase D8)

Hardening: security headers on every response (`next.config.ts`), a
not-found page and error boundaries (`app/not-found.tsx`,
`app/(app)/error.tsx`, `app/global-error.tsx`), an error message when the
opportunity panel can't load, `maxDuration = 300` on the Searches routes
that start a scan in `after()`, and only http(s) posting links are stored or
opened. `e2e/hardening.spec.ts` and `e2e/webhook.spec.ts` cover these and
webhook signature checks and idempotency.

Can't be validated locally (stand-ins are used); check once in production:

1. Sign up with a real inbox: confirmation email arrives, link lands on
   onboarding (Supabase Auth Site URL and redirect URLs, email templates).
   Password reset email the same way.
2. Resume upload and parse with the real Claude API.
3. Checkout with a real card (test mode first): Step 3 success screen, then
   the webhook marks the plan active (Stripe Dashboard → webhook deliveries
   all 2xx).
4. First scan after onboarding finishes (Vercel function logs for the
   onboarding request's `after()` work; `engine_tasks` rows `done`), and the
   ATS boards are reachable from Vercel.
5. Supabase Cron calls `/api/engine/tick` every 5 minutes with the Vault
   secret (`cron.job_run_details` succeeded, `net._http_response` 200, Vercel
   logs), and the 02:00 UTC nightly run completes over the following ticks
   with no tasks stuck in `engine_tasks`.
6. A prepared application's PDFs download and open.
7. Manage billing opens the portal; cancel at period end, then undo; switch
   plans (upgrade now, downgrade at period end) with the documented portal
   configuration; webhook deliveries succeed and Settings reflects each.
8. `NEXT_PUBLIC_APP_URL` is the production URL (checkout and portal return
   links, email links).

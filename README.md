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

## Layout

- `app/`: pages and API routes
- `proxy.ts`: refreshes the Supabase session and keeps signed-out users out of `/dashboard`
- `lib/auth.ts`: `requireUser()` for API routes (user id always comes from the session)
- `lib/supabase/`: browser, server (user session) and admin (service role) clients
- `lib/plans.ts`: plans, limits and access rules (mirrored in the database)
- `lib/billing.ts`, `lib/stripe.ts`: Stripe subscription sync
- `lib/engine/`: Opportunity Engine (see below)
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

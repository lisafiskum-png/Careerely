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

## Stripe webhook

Point a Stripe webhook at `/api/stripe-webhook` with these events:
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`customer.subscription.paused`, `customer.subscription.resumed`.

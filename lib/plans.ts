// Plans and entitlements (Master Brief → Pricing, locked).
//
// Unit of value: applications prepared. Every plan sees all shortlisted
// opportunities and gets the same nightly auto-preparation; plans differ only
// in active searches and monthly preparations.
//
// The database mirrors these limits in public.plan_limits() — a test keeps the
// two in sync. The database is the enforcement point; this module is for the
// server and UI.

export const PLAN_IDS = ['basic', 'pro', 'max'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export type PlanLimits = {
  /** null = unlimited */
  activeSearches: number | null
  monthlyPreparations: number
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  basic: { activeSearches: 1, monthlyPreparations: 10 },
  pro: { activeSearches: 5, monthlyPreparations: 50 },
  max: { activeSearches: null, monthlyPreparations: 200 },
}

export type Plan = {
  id: PlanId
  name: string
  monthlyPriceUsd: number
  features: string[]
  featured?: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    monthlyPriceUsd: 29,
    features: ['1 active search', '10 applications prepared/mo', 'Top 2 nightly auto-prep'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 49,
    features: ['5 active searches', '50 applications prepared/mo', 'Top 2 nightly auto-prep'],
    featured: true,
  },
  {
    id: 'max',
    name: 'Max',
    monthlyPriceUsd: 79,
    features: ['Unlimited searches', '200 applications prepared/mo', 'Top 2 nightly auto-prep'],
  },
]

/**
 * Safety cap (D8) on immediate scans started by Search actions (creating an
 * active search, resuming one), per user per UTC day. Cost/abuse protection,
 * not a plan entitlement shown to users. Mirrors public.immediate_scan_limit()
 * in the database (a test keeps them in sync); the database enforces it.
 */
export const IMMEDIATE_SCANS_PER_DAY: Record<PlanId, number> = { basic: 1, pro: 5, max: 10 }

/** Nightly automatic preparation: the top N opportunities, same on every plan. */
export const NIGHTLY_AUTO_PREP = 2

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value)
}

// Stripe subscription statuses that grant full access while the paid period
// lasts. past_due keeps access while Stripe retries the payment. canceled keeps
// access until the end of the period that was already paid for.
const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due', 'canceled'])

export type SubscriptionState = {
  plan: PlanId | null
  status: string
  current_period_end: string | null
  /** Stripe can schedule cancellation with cancel_at even when cancel_at_period_end is false. */
  cancel_at?: string | null
}

export type AccessState =
  | { kind: 'active'; plan: PlanId }
  | { kind: 'read_only'; reason: 'no_subscription' | 'ended' | 'payment_required' }

/** Effective end of already-paid access, using Stripe's explicit cancel_at when earlier. */
export function subscriptionAccessEnd(sub: SubscriptionState | null): Date | null {
  if (!sub?.current_period_end) return null
  const periodEnd = new Date(sub.current_period_end)
  if (!sub.cancel_at) return periodEnd
  const cancelAt = new Date(sub.cancel_at)
  return cancelAt < periodEnd ? cancelAt : periodEnd
}

/**
 * Same rule as public.has_active_access() in the database. Without an active
 * subscription the account is read-only: existing applications and documents
 * stay available, but Careerely stops searching and preparing.
 */
export function getAccessState(sub: SubscriptionState | null, now: Date = new Date()): AccessState {
  if (!sub || !sub.plan) return { kind: 'read_only', reason: 'no_subscription' }
  if (!ACCESS_STATUSES.has(sub.status)) return { kind: 'read_only', reason: 'payment_required' }
  const accessEnd = subscriptionAccessEnd(sub)
  if (!accessEnd || accessEnd <= now) {
    return { kind: 'read_only', reason: 'ended' }
  }
  return { kind: 'active', plan: sub.plan }
}

/**
 * How many more application packages can be prepared this billing period.
 * Automatic nightly preparation counts toward the limit; once it is reached,
 * Careerely keeps finding and ranking opportunities but stops preparing.
 */
export function remainingPreparations(plan: PlanId, usedThisPeriod: number): number {
  return Math.max(0, PLAN_LIMITS[plan].monthlyPreparations - usedThisPeriod)
}

/** How many opportunities tonight's automatic preparation may prepare. */
export function nightlyPreparationBudget(plan: PlanId, usedThisPeriod: number): number {
  return Math.min(NIGHTLY_AUTO_PREP, remainingPreparations(plan, usedThisPeriod))
}

export function canActivateSearch(plan: PlanId, activeSearches: number): boolean {
  const limit = PLAN_LIMITS[plan].activeSearches
  return limit === null || activeSearches < limit
}

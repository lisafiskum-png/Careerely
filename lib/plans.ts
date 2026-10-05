// Plans and entitlements (Master Brief → Pricing).
//
// Unit of value: applications prepared. Every plan sees all shortlisted
// opportunities and uses the same automatic preparation batch; plans differ
// only in active searches and monthly preparations.
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
    features: ['1 active search', '10 applications prepared/mo', 'Automatic application prep'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 49,
    features: ['5 active searches', '50 applications prepared/mo', 'Automatic application prep'],
    featured: true,
  },
  {
    id: 'max',
    name: 'Max',
    monthlyPriceUsd: 79,
    features: ['Unlimited searches', '200 applications prepared/mo', 'Automatic application prep'],
  },
]

/**
 * Safety cap on immediate scans started by explicit Search actions (creating an
 * active search, resuming one), per user per UTC day. Cost/abuse protection,
 * not a plan entitlement shown to users. Continuous market cycles still keep
 * every active search moving even after this manual-action allowance is used.
 */
export const IMMEDIATE_SCANS_PER_DAY: Record<PlanId, number> = { basic: 1, pro: 5, max: 10 }

/** Automatic preparation batch: strongest N currently shortlisted opportunities. */
export const AUTO_PREP_BATCH = 2

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value)
}

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

/** Same rule as public.has_active_access() in the database. */
export function getAccessState(sub: SubscriptionState | null, now: Date = new Date()): AccessState {
  if (!sub || !sub.plan) return { kind: 'read_only', reason: 'no_subscription' }
  if (!ACCESS_STATUSES.has(sub.status)) return { kind: 'read_only', reason: 'payment_required' }
  const accessEnd = subscriptionAccessEnd(sub)
  if (!accessEnd || accessEnd <= now) return { kind: 'read_only', reason: 'ended' }
  return { kind: 'active', plan: sub.plan }
}

/** How many more application packages can be prepared this billing period. */
export function remainingPreparations(plan: PlanId, usedThisPeriod: number): number {
  return Math.max(0, PLAN_LIMITS[plan].monthlyPreparations - usedThisPeriod)
}

/** How many opportunities one automatic preparation decision may reserve. */
export function automaticPreparationBudget(plan: PlanId, usedThisPeriod: number): number {
  return Math.min(AUTO_PREP_BATCH, remainingPreparations(plan, usedThisPeriod))
}

export function canActivateSearch(plan: PlanId, activeSearches: number): boolean {
  const limit = PLAN_LIMITS[plan].activeSearches
  return limit === null || activeSearches < limit
}

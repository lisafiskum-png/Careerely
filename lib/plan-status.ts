// Settings → Plan (Phase D6): what the user's stored subscription means, in the
// approved wording (decision 2026-10-02). Pure, so every state is unit tested.
// Prices are never shown here: the exact amount, currency, taxes and proration
// belong to Stripe's Customer Portal. Entitlements come from lib/plans.ts.

import { getAccessState, PLAN_LIMITS, PLANS, type PlanId, type SubscriptionState } from './plans'

export type StoredSubscription = SubscriptionState & {
  cancel_at_period_end: boolean | null
  stripe_customer_id: string | null
}

export type PlanStatus = {
  kind: 'active' | 'cancelling' | 'past_due' | 'ended' | 'payment_required' | 'none'
  /** "Pro · 5 active searches · 50 applications prepared a month"; null without a current plan. */
  plan: string | null
  status: string
  readOnly: boolean
  /** Offer the plan picker (Stripe Checkout): only without a subscription that still needs settling. */
  canSubscribe: boolean
  /** "Manage billing" needs a Stripe customer, current or former. */
  canManageBilling: boolean
}

const READ_ONLY_NOTE = 'Your account is read-only: your applications and documents are still here.'
const PAYMENT_FAILED = 'Payment failed. Update your payment method in Manage billing to keep your plan.'

/** "12 November 2026" (UTC, so server and client agree). */
export function formatPlanDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "Pro · 5 active searches · 50 applications prepared a month", from the canonical plan configuration. */
export function planEntitlements(plan: PlanId): string {
  const name = PLANS.find(p => p.id === plan)?.name ?? plan
  const { activeSearches, monthlyPreparations } = PLAN_LIMITS[plan]
  const searches = activeSearches === null ? 'Unlimited active searches' : `${activeSearches} active ${activeSearches === 1 ? 'search' : 'searches'}`
  return `${name} · ${searches} · ${monthlyPreparations} applications prepared a month`
}

export function describePlan(sub: StoredSubscription | null, now: Date = new Date()): PlanStatus {
  const access = getAccessState(sub, now)
  const canManageBilling = Boolean(sub?.stripe_customer_id)
  const end = sub?.current_period_end ? formatPlanDate(sub.current_period_end) : null

  if (access.kind === 'active') {
    const plan = planEntitlements(access.plan)
    const base = { plan, readOnly: false, canSubscribe: false, canManageBilling }
    // Access implies a stored period end (see getAccessState), so dates are never invented.
    if (sub!.status === 'past_due') return { ...base, kind: 'past_due', status: PAYMENT_FAILED }
    if (sub!.cancel_at_period_end || sub!.status === 'canceled') {
      return { ...base, kind: 'cancelling', status: `Ends on ${end}. You keep full access until then.` }
    }
    return { ...base, kind: 'active', status: `Renews on ${end}` }
  }

  const readOnly = { plan: null, readOnly: true, canManageBilling }
  if (access.reason === 'no_subscription') return { ...readOnly, kind: 'none', status: 'No plan', readOnly: true, canSubscribe: true }
  if (access.reason === 'payment_required') {
    // An unpaid subscription is settled in the portal, not by starting another one.
    return { ...readOnly, kind: 'payment_required', status: `${PAYMENT_FAILED} ${READ_ONLY_NOTE}`, canSubscribe: false }
  }
  return {
    ...readOnly,
    kind: 'ended',
    status: end ? `Your plan ended on ${end}. ${READ_ONLY_NOTE}` : `Your plan has ended. ${READ_ONLY_NOTE}`,
    canSubscribe: true,
  }
}

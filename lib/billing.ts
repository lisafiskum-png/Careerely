import type Stripe from 'stripe'
import type { PlanId } from './plans'

// Pure mapping from a Stripe subscription to the row stored in
// public.subscriptions. Kept free of I/O so it can be unit tested.

export type SubscriptionRow = {
  user_id: string
  stripe_customer_id: string
  stripe_subscription_id: string
  plan: PlanId | null
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

const toIso = (seconds: number | null | undefined) =>
  typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null

export function subscriptionToRow(
  sub: Stripe.Subscription,
  userId: string,
  priceToPlan: Record<string, PlanId>,
): SubscriptionRow {
  const item = sub.items.data[0]
  const plan = item ? (priceToPlan[item.price.id] ?? null) : null

  let periodEnd = item?.current_period_end ?? null
  // A subscription cancelled immediately (not at period end) ends now: don't
  // keep granting access until the old period end.
  if (sub.status === 'canceled' && typeof sub.ended_at === 'number' && periodEnd !== null) {
    periodEnd = Math.min(periodEnd, sub.ended_at)
  }

  return {
    user_id: userId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    plan,
    status: sub.status,
    current_period_start: toIso(item?.current_period_start),
    current_period_end: toIso(periodEnd),
    cancel_at_period_end: sub.cancel_at_period_end,
  }
}

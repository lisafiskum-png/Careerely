import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { subscriptionToRow } from '../../lib/billing'

const priceToPlan = { price_basic: 'basic', price_pro: 'pro', price_max: 'max' } as const

function subscription(overrides: Partial<Stripe.Subscription> = {}, priceId = 'price_pro'): Stripe.Subscription {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    ended_at: null,
    items: {
      data: [{ price: { id: priceId }, current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

describe('subscriptionToRow', () => {
  it('maps the price to a plan and the item period to the row', () => {
    expect(subscriptionToRow(subscription(), 'user-1', priceToPlan)).toEqual({
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      plan: 'pro',
      status: 'active',
      current_period_start: new Date(1_790_000_000 * 1000).toISOString(),
      current_period_end: new Date(1_792_592_000 * 1000).toISOString(),
      cancel_at_period_end: false,
    })
  })

  it('leaves the plan empty for an unknown price, which grants no access', () => {
    expect(subscriptionToRow(subscription({}, 'price_legacy'), 'user-1', priceToPlan).plan).toBeNull()
  })

  it('keeps the paid period for cancel-at-period-end', () => {
    const row = subscriptionToRow(subscription({ cancel_at_period_end: true }), 'user-1', priceToPlan)
    expect(row.cancel_at_period_end).toBe(true)
    expect(row.current_period_end).toBe(new Date(1_792_592_000 * 1000).toISOString())
  })

  it('ends access at the cancellation time for an immediate cancellation', () => {
    const endedAt = 1_791_000_000
    const row = subscriptionToRow(subscription({ status: 'canceled', ended_at: endedAt }), 'user-1', priceToPlan)
    expect(row.current_period_end).toBe(new Date(endedAt * 1000).toISOString())
  })
})

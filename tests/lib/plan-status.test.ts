import { describe, expect, it } from 'vitest'
import { describePlan, planChangeNotice, planEntitlements, type StoredSubscription } from '../../lib/plan-status'
import { getAccessState } from '../../lib/plans'

const now = new Date('2026-10-02T12:00:00Z')
const sub = (o: Partial<StoredSubscription> = {}): StoredSubscription => ({
  plan: 'pro',
  status: 'active',
  current_period_end: '2026-11-12T08:00:00Z',
  cancel_at_period_end: false,
  stripe_customer_id: 'cus_123',
  ...o,
})
const READ_ONLY = 'Your account is read-only: your applications and documents are still here.'

describe('planEntitlements (from lib/plans.ts, no price)', () => {
  it('names the plan and its entitlements', () => {
    expect(planEntitlements('basic')).toBe('Basic · 1 active search · 10 applications prepared a month')
    expect(planEntitlements('pro')).toBe('Pro · 5 active searches · 50 applications prepared a month')
    expect(planEntitlements('max')).toBe('Max · Unlimited active searches · 200 applications prepared a month')
  })
})

describe('describePlan (approved wording)', () => {
  it('active and trialing: renews on the stored date', () => {
    for (const status of ['active', 'trialing']) {
      expect(describePlan(sub({ status }), now)).toEqual({
        kind: 'active',
        plan: 'Pro · 5 active searches · 50 applications prepared a month',
        status: 'Renews on 12 November 2026',
        readOnly: false,
        canSubscribe: false,
        canManageBilling: true,
      })
    }
  })

  it('cancelling: ends on the stored date, full access until then', () => {
    expect(describePlan(sub({ cancel_at_period_end: true }), now)).toMatchObject({ kind: 'cancelling', status: 'Ends on 12 November 2026. You keep full access until then.', readOnly: false })
    expect(describePlan(sub({ status: 'canceled' }), now)).toMatchObject({ kind: 'cancelling', readOnly: false })
  })

  it('past due: access continues while Stripe retries', () => {
    expect(describePlan(sub({ status: 'past_due' }), now)).toMatchObject({
      kind: 'past_due',
      status: 'Payment failed. Update your payment method in Manage billing to keep your plan.',
      readOnly: false,
      canManageBilling: true,
    })
  })

  it('ended: read-only, with the stored end date; a former subscriber keeps Manage billing', () => {
    expect(describePlan(sub({ status: 'canceled', current_period_end: '2026-09-20T00:00:00Z' }), now)).toEqual({
      kind: 'ended',
      plan: null,
      status: `Your plan ended on 20 September 2026. ${READ_ONLY}`,
      readOnly: true,
      canSubscribe: true,
      canManageBilling: true,
    })
  })

  it('never invents a date', () => {
    expect(describePlan(sub({ status: 'active', current_period_end: null }), now)).toMatchObject({ kind: 'ended', status: `Your plan has ended. ${READ_ONLY}` })
  })

  it('unpaid: read-only, settled in the portal rather than a second checkout', () => {
    expect(describePlan(sub({ status: 'unpaid' }), now)).toMatchObject({ kind: 'payment_required', readOnly: true, canSubscribe: false, canManageBilling: true })
  })

  it('never subscribed: "No plan"; Manage billing only with a Stripe customer', () => {
    expect(describePlan(null, now)).toEqual({ kind: 'none', plan: null, status: 'No plan', readOnly: true, canSubscribe: true, canManageBilling: false })
    // Checkout was started (customer created) but never completed.
    expect(describePlan(sub({ plan: null, status: 'incomplete', current_period_end: null }), now)).toMatchObject({ kind: 'none', canManageBilling: true })
  })
})

describe('describePlan follows the canonical access rule', () => {
  it('is read-only exactly when getAccessState says so; past_due keeps full access', () => {
    for (const status of ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      for (const end of ['2026-11-12T08:00:00Z', '2026-09-01T00:00:00Z']) {
        const s = sub({ status, current_period_end: end })
        expect(describePlan(s, now).readOnly, `${status} ${end}`).toBe(getAccessState(s, now).kind !== 'active')
      }
    }
    const pastDue = describePlan(sub({ status: 'past_due' }), now)
    expect(pastDue).toMatchObject({ readOnly: false, canSubscribe: false, canManageBilling: true })
    expect(pastDue.status).not.toContain('read-only')
  })
})

describe('planChangeNotice (dismissal is separate from provenance)', () => {
  const searches = [
    { name: 'Auto, earlier', status: 'paused', paused_by_plan_change_at: '2026-10-01T10:00:00Z' },
    { name: 'Auto, later', status: 'paused', paused_by_plan_change_at: '2026-10-02T10:00:00Z' },
    { name: 'Manual', status: 'paused', paused_by_plan_change_at: null },
    { name: 'Active', status: 'active', paused_by_plan_change_at: null },
  ]
  it('names only searches paused by a plan change since the last dismissal', () => {
    expect(planChangeNotice(searches, null).map(s => s.name)).toEqual(['Auto, earlier', 'Auto, later'])
    expect(planChangeNotice(searches, '2026-10-01T12:00:00Z').map(s => s.name)).toEqual(['Auto, later'])
    expect(planChangeNotice(searches, '2026-10-03T00:00:00Z')).toEqual([])
  })
})

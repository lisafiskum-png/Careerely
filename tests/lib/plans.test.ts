import { describe, expect, it } from 'vitest'
import {
  PLANS,
  PLAN_LIMITS,
  automaticPreparationBudget,
  canActivateSearch,
  getAccessState,
  isPlanId,
  remainingPreparations,
} from '../../lib/plans'

const now = new Date('2026-10-15T12:00:00Z')
const future = '2026-10-20T00:00:00Z'
const past = '2026-10-10T00:00:00Z'

describe('pricing', () => {
  it('matches the plan definitions', () => {
    expect(PLANS.map(p => [p.id, p.name, p.monthlyPriceUsd])).toEqual([
      ['basic', 'Basic', 29],
      ['pro', 'Pro', 49],
      ['max', 'Max', 79],
    ])
    expect(PLAN_LIMITS).toEqual({
      basic: { activeSearches: 1, monthlyPreparations: 10 },
      pro: { activeSearches: 5, monthlyPreparations: 50 },
      max: { activeSearches: null, monthlyPreparations: 200 },
    })
    expect(PLANS.every(p => p.features.some(f => f === 'Automatic application prep'))).toBe(true)
  })

  it('rejects legacy plan ids', () => {
    expect(isPlanId('standard')).toBe(false)
    expect(isPlanId('premium')).toBe(false)
    expect(isPlanId('pro')).toBe(true)
  })
})

describe('getAccessState', () => {
  it('is read-only without a subscription (no free tier, no trial)', () => {
    expect(getAccessState(null, now)).toEqual({ kind: 'read_only', reason: 'no_subscription' })
    expect(getAccessState({ plan: null, status: 'incomplete', current_period_end: null }, now).kind).toBe('read_only')
  })

  it('grants access to active subscriptions', () => {
    expect(getAccessState({ plan: 'pro', status: 'active', current_period_end: future }, now)).toEqual({ kind: 'active', plan: 'pro' })
  })

  it('keeps access until the end of a cancelled period', () => {
    expect(getAccessState({ plan: 'basic', status: 'canceled', current_period_end: future }, now).kind).toBe('active')
    expect(getAccessState({ plan: 'basic', status: 'canceled', current_period_end: past }, now)).toEqual({ kind: 'read_only', reason: 'ended' })
  })

  it('is read-only when payment is required', () => {
    for (const status of ['unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(getAccessState({ plan: 'max', status, current_period_end: future }, now)).toEqual({ kind: 'read_only', reason: 'payment_required' })
    }
  })
})

describe('preparation allowance', () => {
  it('counts automatic preparation toward the monthly limit', () => {
    expect(automaticPreparationBudget('basic', 0)).toBe(2)
    expect(automaticPreparationBudget('basic', 9)).toBe(1)
    expect(automaticPreparationBudget('basic', 10)).toBe(0)
    expect(automaticPreparationBudget('max', 199)).toBe(1)
  })

  it('never goes negative', () => {
    expect(remainingPreparations('pro', 60)).toBe(0)
  })
})

describe('active searches', () => {
  it('applies plan limits', () => {
    expect(canActivateSearch('basic', 0)).toBe(true)
    expect(canActivateSearch('basic', 1)).toBe(false)
    expect(canActivateSearch('pro', 4)).toBe(true)
    expect(canActivateSearch('pro', 5)).toBe(false)
    expect(canActivateSearch('max', 500)).toBe(true)
  })
})

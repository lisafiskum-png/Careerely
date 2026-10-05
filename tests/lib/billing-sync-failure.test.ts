import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncSubscription } from '../../lib/billing-sync'

beforeEach(() => { process.env.STRIPE_PRICE_PRO = 'price_pro' })

function clients(metadata: Record<string, string>, failRead: boolean) {
  const subscription = {
    id: 'sub_old', customer: 'cus_user', status: 'canceled', metadata,
    cancel_at_period_end: false, cancel_at: null, ended_at: 1,
    items: { data: [{ price: { id: 'price_pro' }, current_period_start: 1, current_period_end: 2 }] },
  }
  const stripe = { subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) } } as unknown as Stripe
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const failure = new Error('billing database unavailable')
  const admin = {
    from: () => ({
      select: (columns: string) => ({ eq: () => ({ maybeSingle: async () => ({
        data: failRead ? null : columns === 'user_id' ? { user_id: 'user' } : {
          stripe_subscription_id: 'sub_active', plan: 'pro', status: 'active',
          current_period_end: new Date(Date.now() + 86_400_000).toISOString(), cancel_at: null,
        },
        error: failRead ? failure : null,
      }) }) }),
      upsert,
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  } as unknown as SupabaseClient
  return { admin, stripe, upsert }
}

describe('billing synchronization safety', () => {
  it('does not overwrite subscription state when reading the current subscription fails', async () => {
    const { admin, stripe, upsert } = clients({ user_id: 'user' }, true)
    await expect(syncSubscription(admin, stripe, 'sub_old', null)).rejects.toThrow('billing database unavailable')
    expect(upsert).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('keeps a failed customer lookup retryable instead of treating it as an unknown user', async () => {
    const { admin, stripe, upsert } = clients({}, true)
    await expect(syncSubscription(admin, stripe, 'sub_old', null)).rejects.toThrow('billing database unavailable')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('preserves a newer active subscription when an older ended subscription arrives', async () => {
    const { admin, stripe, upsert } = clients({ user_id: 'user' }, false)
    await syncSubscription(admin, stripe, 'sub_old', null)
    expect(upsert).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })
})

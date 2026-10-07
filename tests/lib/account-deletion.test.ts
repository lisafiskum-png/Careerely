import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { permanentlyDeleteAccount } from '../../lib/account-deletion'

function clients(subscription: { stripe_customer_id: string | null; stripe_subscription_id: string | null }) {
  const events: string[] = []
  const remove = vi.fn(async (paths: string[]) => {
    events.push(`storage:${paths.join(',')}`)
    return { error: null }
  })
  const admin = {
    from(table: string) {
      expect(table).toBe('subscriptions')
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: subscription, error: null }),
      }
      return query
    },
    storage: {
      from(bucket: string) {
        return {
          list: async (prefix: string) => ({
            data: bucket === 'resumes' && prefix === 'user-1'
              ? [{ id: 'file-1', name: 'resume.pdf' }]
              : [],
            error: null,
          }),
          remove,
        }
      },
    },
    auth: {
      admin: {
        deleteUser: vi.fn(async () => {
          events.push('auth:delete')
          return { error: null }
        }),
      },
    },
  } as unknown as SupabaseClient
  const stripe = {
    customers: {
      del: vi.fn(async (id: string) => {
        events.push(`stripe:customer:${id}`)
        return { id, deleted: true }
      }),
    },
    subscriptions: {
      cancel: vi.fn(async (id: string) => {
        events.push(`stripe:subscription:${id}`)
        return { id }
      }),
    },
  } as unknown as Stripe
  return { admin, stripe, events, remove }
}

describe('permanent account deletion', () => {
  it('stops billing, removes private files, then deletes the Auth user', async () => {
    const { admin, stripe, events, remove } = clients({
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
    })

    await permanentlyDeleteAccount(admin, stripe, 'user-1')

    expect(events).toEqual([
      'stripe:customer:cus_123',
      'storage:user-1/resume.pdf',
      'auth:delete',
    ])
    expect(remove).toHaveBeenCalledWith(['user-1/resume.pdf'])
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
  })

  it('uses the legacy subscription fallback when no Stripe customer is stored', async () => {
    const { admin, stripe, events } = clients({
      stripe_customer_id: null,
      stripe_subscription_id: 'sub_legacy',
    })

    await permanentlyDeleteAccount(admin, stripe, 'user-1')

    expect(events[0]).toBe('stripe:subscription:sub_legacy')
    expect(events.at(-1)).toBe('auth:delete')
  })

  it('continues a retry when the Stripe customer was already removed', async () => {
    const { admin, stripe, events } = clients({
      stripe_customer_id: 'cus_missing',
      stripe_subscription_id: null,
    })
    vi.mocked(stripe.customers.del).mockRejectedValueOnce({ code: 'resource_missing' })

    await permanentlyDeleteAccount(admin, stripe, 'user-1')

    expect(events).toEqual(['storage:user-1/resume.pdf', 'auth:delete'])
  })
})

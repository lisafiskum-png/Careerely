import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { buildAccountExport } from '../../lib/account-export'

function client() {
  const data: Record<string, unknown[]> = {
    profiles: [{ id: 'user-1', email: 'person@example.com' }],
    subscriptions: [{ user_id: 'user-1', plan: 'pro', status: 'active', stripe_customer_id: 'cus_secret', stripe_subscription_id: 'sub_secret' }],
    career_profiles: [{ user_id: 'user-1', target_roles: ['People Partner'] }],
    searches: [],
    search_runs: [],
    opportunities: [{ user_id: 'user-1', job_id: 'job-1' }],
    evidence: [],
    rejections: [],
    application_packages: [],
    applications: [{ user_id: 'user-1', job_id: 'job-1' }],
    activity: [],
    behavioral_signals: [],
    jobs: [{ id: 'job-1', title: 'People Partner' }],
  }

  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: async () => ({ data: data[table], error: null }),
        in: async () => ({ data: data[table], error: null }),
      }
      return query
    },
  } as unknown as SupabaseClient
}

describe('account data export', () => {
  it('includes user-owned career data and linked jobs without Stripe identifiers', async () => {
    const result = await buildAccountExport(client(), {
      id: 'user-1',
      email: 'person@example.com',
      created_at: '2026-10-01T00:00:00.000Z',
    })

    expect(result.format).toBe('careerely-account-export')
    expect(result.account.email).toBe('person@example.com')
    expect(result.data.career_profiles).toEqual([{ user_id: 'user-1', target_roles: ['People Partner'] }])
    expect(result.data.jobs).toEqual([{ id: 'job-1', title: 'People Partner' }])
    expect(result.data.subscriptions).toEqual([{ user_id: 'user-1', plan: 'pro', status: 'active' }])
  })

  it('fails rather than returning a silently incomplete export', async () => {
    const broken = {
      from() {
        const query = {
          select: () => query,
          eq: async () => ({ data: null, error: { message: 'database unavailable' } }),
        }
        return query
      },
    } as unknown as SupabaseClient

    await expect(buildAccountExport(broken, { id: 'user-1' })).rejects.toThrow('Could not export profiles')
  })
})

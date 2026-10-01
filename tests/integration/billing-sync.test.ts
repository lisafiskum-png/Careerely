import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

// Subscription sync (Phase D6) against the local Supabase stack: a downgrade
// below the active-search count pauses only the excess once it takes effect,
// repeated deliveries change nothing, and upgrading never resumes searches.
// Stripe is a stub returning the subscription as Stripe would. Skipped when
// the local stack isn't running.

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const reachable = await fetch(`${SUPABASE_URL}/auth/v1/health`).then(r => r.ok).catch(() => false)

process.env.STRIPE_PRICE_BASIC = 'price_basic'
process.env.STRIPE_PRICE_PRO = 'price_pro'
process.env.STRIPE_PRICE_MAX = 'price_max'
const { syncSubscription } = await import('../../lib/billing-sync')

const DAY = 86_400
const now = Math.floor(Date.now() / 1000)

let admin: SupabaseClient
let userId: string
const subId = `sub_d6_${Date.now()}`
const customerId = `cus_d6_${Date.now()}`

function stripeReturning(price: string, extra: Partial<Stripe.Subscription> = {}, period = { start: now - 10 * DAY, end: now + 20 * DAY }): Stripe {
  const subscription = {
    id: subId,
    customer: customerId,
    status: 'active',
    cancel_at_period_end: false,
    ended_at: null,
    metadata: { user_id: userId },
    schedule: null,
    items: { data: [{ price: { id: price }, current_period_start: period.start, current_period_end: period.end }] },
    ...extra,
  }
  return { subscriptions: { retrieve: async () => subscription } } as unknown as Stripe
}

async function searches() {
  const { data } = await admin.from('searches').select('name, status, paused_by_plan_change_at').eq('user_id', userId).order('name')
  return data ?? []
}
const plan = async () => (await admin.from('subscriptions').select('plan').eq('user_id', userId).single()).data!.plan

describe.skipIf(!reachable)('subscription sync and plan limits (D6)', () => {
  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const { data, error } = await admin.auth.admin.createUser({ email: `d6-sync+${Date.now()}@example.com`, password: 'password-123', email_confirm: true })
    if (error) throw error
    userId = data.user.id
    await syncSubscription(admin, stripeReturning('price_pro'), subId, userId)
    const ago = (days: number) => new Date(Date.now() - days * DAY * 1000).toISOString()
    const { error: insertError } = await admin.from('searches').insert([
      { user_id: userId, name: 'A · from profile', status: 'active', created_from_profile: true, created_at: ago(1) },
      { user_id: userId, name: 'B · oldest', status: 'active', created_from_profile: false, created_at: ago(5) },
      { user_id: userId, name: 'C · newest', status: 'active', created_from_profile: false, created_at: ago(0.1) },
    ])
    if (insertError) throw insertError
  })
  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  })

  it('a downgrade scheduled for the period end changes nothing early', async () => {
    // Stripe keeps the current price on the subscription until the scheduled change applies.
    await syncSubscription(admin, stripeReturning('price_pro', { schedule: 'sub_sched_123' } as Partial<Stripe.Subscription>), subId, null)
    expect(await plan()).toBe('pro')
    expect((await searches()).map(s => s.status)).toEqual(['active', 'active', 'active'])
  })

  it('once the downgrade is effective, only the excess is paused and marked', async () => {
    await syncSubscription(admin, stripeReturning('price_basic', {}, { start: now, end: now + 30 * DAY }), subId, null)
    expect(await plan()).toBe('basic')
    const rows = await searches()
    expect(rows.map(r => [r.name, r.status, r.paused_by_plan_change_at !== null])).toEqual([
      ['A · from profile', 'active', false],
      ['B · oldest', 'paused', true],
      ['C · newest', 'paused', true],
    ])
  })

  it('repeated delivery of the same subscription changes nothing more', async () => {
    const before = await searches()
    for (let i = 0; i < 2; i++) await syncSubscription(admin, stripeReturning('price_basic', {}, { start: now, end: now + 30 * DAY }), subId, null)
    expect(await searches()).toEqual(before)
  })

  it('upgrading later does not resume searches paused by the downgrade', async () => {
    await syncSubscription(admin, stripeReturning('price_max', {}, { start: now, end: now + 30 * DAY }), subId, null)
    expect(await plan()).toBe('max')
    expect((await searches()).map(s => [s.name, s.status, s.paused_by_plan_change_at !== null])).toEqual([
      ['A · from profile', 'active', false],
      ['B · oldest', 'paused', true],
      ['C · newest', 'paused', true],
    ])
    // No scans were queued for the paused searches.
    const { data: tasks } = await admin.from('engine_tasks').select('id, search_id').eq('user_id', userId)
    expect(tasks ?? []).toEqual([])
  })
})

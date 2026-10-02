import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_URL } from '../playwright.config'

// D8: the Stripe webhook verifies signatures and processes each event once.
// Signed exactly as Stripe signs, with the local test secret (playwright.config).

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stripe = new Stripe('sk_test_123')
const SECRET = 'whsec_test'

test('rejects unsigned events and records each event once', async ({ request }) => {
  const id = `evt_e2e_${Date.now()}`
  // An event type the app doesn't act on: proves verification and idempotency without touching billing state.
  const payload = JSON.stringify({ id, object: 'event', type: 'invoice.created', data: { object: { id: 'in_e2e' } } })

  const forged = await request.post('/api/stripe-webhook', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=forged' } })
  expect(forged.status()).toBe(400)
  expect((await admin.from('stripe_events').select('id').eq('id', id)).data).toEqual([])

  const sign = () => stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
  const first = await request.post('/api/stripe-webhook', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': sign() } })
  expect(first.status()).toBe(200)
  expect(await first.json()).toEqual({ received: true })
  const again = await request.post('/api/stripe-webhook', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': sign() } })
  expect(again.status()).toBe(200)
  expect(await again.json()).toEqual({ received: true, duplicate: true })
  expect((await admin.from('stripe_events').select('id').eq('id', id)).data).toHaveLength(1)
  await admin.from('stripe_events').delete().eq('id', id)
})

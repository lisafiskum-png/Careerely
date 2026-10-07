import { createAdminClient } from '../../../lib/supabase/admin'
import { getStripe } from '../../../lib/stripe'
import { syncSubscription } from '../../../lib/billing-sync'
import { env } from '../../../lib/env'

// Stripe is the only writer of billing state (public.subscriptions).
// Events are verified, processed idempotently, and always re-read from Stripe so
// out-of-order delivery cannot roll the subscription back to an older state.

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
])

export async function POST(request) {
  const stripe = getStripe()
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.stripeWebhookSecret())
  } catch (err) {
    return Response.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    const { data: seen, error: seenError } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle()
    if (seenError) throw seenError
    if (seen) return Response.json({ received: true, duplicate: true })

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      if (session.mode === 'subscription' && session.subscription) {
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        await syncSubscription(admin, stripe, subscriptionId, session.client_reference_id)
      }
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const subscription = event.data.object
      await syncSubscription(admin, stripe, subscription.id, subscription.metadata?.user_id || null)
    }

    const { error } = await admin.from('stripe_events').insert({ id: event.id, type: event.type })
    if (error && error.code !== '23505') throw error

    return Response.json({ received: true })
  } catch (err) {
    console.error('stripe-webhook failed', event.type, event.id, err)
    // Non-2xx makes Stripe retry the event.
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

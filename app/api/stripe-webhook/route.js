import { createAdminClient } from '../../../lib/supabase/admin'
import { getStripe, priceIdToPlanMap } from '../../../lib/stripe'
import { subscriptionToRow } from '../../../lib/billing'
import { getAccessState } from '../../../lib/plans'
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
    const { data: seen } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle()
    if (seen) return Response.json({ received: true, duplicate: true })

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      if (session.mode === 'subscription' && session.subscription) {
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        await syncSubscription(admin, stripe, subscriptionId, session.client_reference_id)
      }
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      await syncSubscription(admin, stripe, event.data.object.id, null)
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

async function syncSubscription(admin, stripe, subscriptionId, userIdHint) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  let userId = userIdHint || subscription.metadata?.user_id
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
    userId = data?.user_id
  }
  if (!userId) {
    throw new Error(`No Careerely user for Stripe subscription ${subscription.id}`)
  }

  const row = subscriptionToRow(subscription, userId, priceIdToPlanMap())

  // Never let an older, ended subscription overwrite a different one that still grants access.
  const { data: current } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (
    current?.stripe_subscription_id &&
    current.stripe_subscription_id !== row.stripe_subscription_id &&
    getAccessState(current).kind === 'active' &&
    getAccessState(row).kind !== 'active'
  ) {
    return
  }

  const { error } = await admin.from('subscriptions').upsert(row, { onConflict: 'user_id' })
  if (error) throw error
}

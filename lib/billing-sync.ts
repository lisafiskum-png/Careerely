import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { priceIdToPlanMap } from './stripe'
import { subscriptionToRow } from './billing'
import { getAccessState } from './plans'

/**
 * Re-reads a subscription from Stripe and stores it in public.subscriptions.
 * Used by the webhook and by the checkout return (so onboarding does not have
 * to wait for the webhook). Safe to call repeatedly.
 */
export async function syncSubscription(
  admin: SupabaseClient,
  stripe: Stripe,
  subscriptionId: string,
  userIdHint: string | null,
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  let userId = userIdHint || subscription.metadata?.user_id
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
    userId = data?.user_id
  }
  if (!userId) throw new Error(`No Careerely user for Stripe subscription ${subscription.id}`)

  const row = subscriptionToRow(subscription, userId, priceIdToPlanMap())

  // Never let an older, ended subscription overwrite a different one that still grants access.
  const { data: current } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, plan, status, current_period_end, cancel_at')
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

  // Decision 2026-10-02: once a lower plan is in effect, pause only the active
  // searches above its limit (recorded, and shown on Searches and Settings).
  // The stored plan comes from the subscription's current item, so a downgrade
  // scheduled for the period end changes nothing until it takes effect.
  // Idempotent: within the limit there is nothing left to pause.
  const { error: limitError } = await admin.rpc('apply_plan_search_limit', { uid: userId })
  if (limitError) throw limitError
}

/**
 * Confirms a Checkout Session returned to our success URL belongs to this
 * user, and syncs its subscription.
 */
export async function syncCheckoutSession(
  admin: SupabaseClient,
  stripe: Stripe,
  sessionId: string,
  userId: string,
): Promise<void> {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.client_reference_id !== userId) throw new Error('Checkout session does not belong to this user')
  if (session.mode !== 'subscription' || !session.subscription) return
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  await syncSubscription(admin, stripe, subscriptionId, userId)
}

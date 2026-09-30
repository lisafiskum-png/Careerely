import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../lib/auth'
import { createAdminClient } from '../../../lib/supabase/admin'
import { getStripe, priceIdForPlan } from '../../../lib/stripe'
import { getAccessState, isPlanId } from '../../../lib/plans'
import { env } from '../../../lib/env'

// Starts a Stripe Checkout session for the signed-in user.
// The user id and email come from the session, never from the request body.
export async function POST(request) {
  try {
    const user = await requireUser()
    const { plan, flow } = await request.json().catch(() => ({}))
    if (!isPlanId(plan)) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: existing, error: readError } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, plan, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle()
    if (readError) throw readError

    if (getAccessState(existing).kind === 'active') {
      // Plan changes go through the Stripe customer portal (Phase E).
      return Response.json({ error: 'You already have an active subscription.' }, { status: 409 })
    }

    const stripe = getStripe()
    let customerId = existing?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      const { error: writeError } = await admin
        .from('subscriptions')
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: 'user_id' })
      if (writeError) throw writeError
    }

    const appUrl = env.appUrl()
    // Onboarding places checkout on "Find my matches" and returns to Step 3,
    // which confirms the session and starts the first search.
    const returnUrls =
      flow === 'onboarding'
        ? {
            success_url: `${appUrl}/onboarding/3?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/onboarding/3?checkout=cancelled`,
          }
        : {
            success_url: `${appUrl}/dashboard?checkout=success`,
            cancel_url: `${appUrl}/dashboard?checkout=cancelled`,
          }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      ...returnUrls,
    })

    return Response.json({ url: session.url })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('stripe-checkout failed', err)
    return Response.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
}

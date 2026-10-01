import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { createClient } from '../../../../lib/supabase/server'
import { getStripe } from '../../../../lib/stripe'
import { env } from '../../../../lib/env'

// "Manage billing" (Phase D6): opens Stripe's own Customer Portal for plan
// changes, cancellation, payment method and invoices. The Stripe customer
// comes from the signed-in user's stored subscription record, never from the
// request. Former subscribers keep access to invoices and payment history.
// Portal behaviour (cancel at period end, plan switching, proration) is set
// in the Stripe Dashboard; see README → Billing.
export async function POST() {
  try {
    await requireUser()
    // RLS: a user can only read their own subscription row.
    const supabase = await createClient()
    const { data } = await supabase.from('subscriptions').select('stripe_customer_id').maybeSingle()
    if (!data?.stripe_customer_id) return Response.json({ error: 'No billing account yet.' }, { status: 404 })

    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${env.appUrl()}/settings`,
    })
    return Response.json({ url: session.url })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('billing portal failed', err)
    return Response.json({ error: 'Couldn’t open billing. Please try again.' }, { status: 500 })
  }
}

import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../lib/auth'
import { createAdminClient } from '../../../lib/supabase/admin'
import { getStripe } from '../../../lib/stripe'

/** Permanently closes the signed-in account and stops any Stripe subscription. */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as { confirmation?: unknown } | null
    if (body?.confirmation !== 'DELETE') {
      return Response.json({ error: 'Type DELETE to confirm.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: subscription, error: readError } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (readError) throw readError

    if (subscription?.stripe_subscription_id) {
      const stripe = getStripe()
      const current = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id)
      if (current.status !== 'canceled') await stripe.subscriptions.cancel(current.id)
    }

    // User-owned rows have ON DELETE CASCADE foreign keys to auth.users.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return Response.json({ deleted: true })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('account deletion failed', { error: err instanceof Error ? err.message : 'Unknown error' })
    return Response.json({ error: 'Couldn’t delete the account. Please try again or contact hello@careerely.ai.' }, { status: 500 })
  }
}

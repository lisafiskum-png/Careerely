import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

const USER_STORAGE_BUCKETS = ['resumes', 'documents'] as const
const PAGE_SIZE = 100

function isMissingStripeResource(error: unknown): boolean {
  const candidate = error as { code?: string; statusCode?: number; raw?: { code?: string } }
  return candidate?.code === 'resource_missing' || candidate?.raw?.code === 'resource_missing' || candidate?.statusCode === 404
}

async function listUserFiles(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    if (!data?.length) break

    for (const item of data) {
      const path = `${prefix}/${item.name}`
      if (item.id) files.push(path)
      else files.push(...(await listUserFiles(admin, bucket, path)))
    }

    if (data.length < PAGE_SIZE) break
    offset += data.length
  }

  return files
}

async function deleteUserStorage(admin: SupabaseClient, userId: string): Promise<void> {
  for (const bucket of USER_STORAGE_BUCKETS) {
    const paths = await listUserFiles(admin, bucket, userId)
    for (let i = 0; i < paths.length; i += PAGE_SIZE) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE_SIZE))
      if (error) throw error
    }
  }
}

/**
 * Permanently removes a Careerely account after the caller has re-authenticated.
 * Billing is stopped first, then private files are deleted, and the Auth user is
 * removed last so the database's ON DELETE CASCADE constraints clear personal
 * application/search/profile data in one authoritative step.
 *
 * Idempotent enough for a retry after a partial external-service failure:
 * a Stripe customer that was already deleted is treated as success.
 */
export async function permanentlyDeleteAccount(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
): Promise<void> {
  const { data: subscription, error: subscriptionError } = await admin
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (subscriptionError) throw subscriptionError

  // Removing the Stripe Customer immediately stops any active subscription and
  // removes the account-level customer object. Stripe may retain transaction
  // records it is legally required to keep.
  if (subscription?.stripe_customer_id) {
    try {
      await stripe.customers.del(subscription.stripe_customer_id)
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error
    }
  } else if (subscription?.stripe_subscription_id) {
    // Defensive fallback for an incomplete legacy billing row.
    try {
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id)
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error
    }
  }

  await deleteUserStorage(admin, userId)

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
  if (deleteUserError) throw deleteUserError
}

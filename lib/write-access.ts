import 'server-only'
import { createClient } from './supabase/server'
import { getAccessState, type SubscriptionState } from './plans'

// One read-only check for every signed-in write (Phase D7), using the
// canonical access rule (lib/plans.ts, mirrored by has_active_access() in the
// database). Row level security stays the enforcement backstop; this makes
// the response the same everywhere: 403 { code: 'read_only' }. Reading,
// document downloads and the billing portal stay available to read-only
// accounts and don't use this.
export async function readOnlyResponse(): Promise<Response | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at')
    .maybeSingle<SubscriptionState>()
  if (getAccessState(data).kind === 'active') return null
  return Response.json({ error: 'Your account is read-only.', code: 'read_only' }, { status: 403 })
}

import { createClient } from '../../lib/supabase/server'
import { getAccessState, PLANS, type SubscriptionState } from '../../lib/plans'
import { SubscribeButtons } from './_components/subscribe-buttons'

// Placeholder dashboard for Phase A: shows the account's subscription state and
// lets a read-only account subscribe. The real dashboard (My Pick, shortlist,
// Applications Ready, Recent Activity) is built in Phase D.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const { checkout } = await searchParams
  const supabase = await createClient()
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end')
    .maybeSingle<SubscriptionState & { cancel_at_period_end: boolean }>()

  const access = getAccessState(subscription)
  const planName = access.kind === 'active' ? PLANS.find(p => p.id === access.plan)?.name : null

  return (
    <div className="max-w-[720px]">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-pu">Dashboard</p>

      {checkout === 'success' && access.kind !== 'active' && (
        <p className="mb-6 rounded-[var(--radius-card)] border border-line bg-white px-4 py-3 text-[13px]">
          Payment received. Your plan is being activated; refresh in a moment.
        </p>
      )}

      {access.kind === 'active' ? (
        <section className="rounded-[var(--radius-featured)] border border-line bg-white p-6">
          <h1 className="mb-2 text-[22px] font-semibold tracking-[-0.02em]">You&apos;re on {planName}</h1>
          <p className="text-[14px] text-zinc-600">
            {subscription?.cancel_at_period_end && subscription.current_period_end
              ? `Your subscription ends on ${new Date(subscription.current_period_end).toLocaleDateString('en-GB')}.`
              : 'Your subscription is active.'}
          </p>
        </section>
      ) : (
        <section className="rounded-[var(--radius-featured)] border border-line bg-white p-6">
          <h1 className="mb-2 text-[22px] font-semibold tracking-[-0.02em]">Choose a plan</h1>
          <p className="mb-5 text-[14px] text-zinc-600">
            {access.reason === 'no_subscription'
              ? 'Subscribe to let Careerely search and prepare applications for you.'
              : 'Your account is read-only. Your applications and documents are still here; subscribe to resume searching and preparing.'}
          </p>
          <SubscribeButtons />
        </section>
      )}
    </div>
  )
}

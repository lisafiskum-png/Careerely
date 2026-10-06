import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { createClient } from '../../../lib/supabase/server'
import { describePlan, planChangeNotice, type StoredSubscription } from '../../../lib/plan-status'
import { SubscribeButtons } from '../_components/subscribe-buttons'
import { DeleteAccountButton, ManageBillingButton, SignOutButton } from './settings-actions'

// Settings: billing, account identity and privacy controls. Destructive account
// deletion is deliberately separated from ordinary sign-out and requires a
// fresh password check plus explicit confirmation.
export default async function SettingsPage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/settings')
  const supabase = await createClient()
  const [{ data: sub }, { data: paused }, { data: profile }] = await Promise.all([
    supabase.from('subscriptions').select('plan, status, current_period_end, cancel_at_period_end, cancel_at, stripe_customer_id').maybeSingle<StoredSubscription>(),
    supabase.from('searches').select('status, paused_by_plan_change_at').eq('status', 'paused').not('paused_by_plan_change_at', 'is', null),
    supabase.from('profiles').select('plan_change_notice_dismissed_at').eq('id', user.id).maybeSingle(),
  ])
  // Access and wording from the canonical rule (getAccessState via describePlan).
  const plan = describePlan(sub)
  const pausedCount = planChangeNotice(paused ?? [], profile?.plan_change_notice_dismissed_at ?? null).length

  return (
    <main className="page">
      <header className="op-header">
        <div>
          <h1 className="op-title">Settings</h1>
          <div className="op-subtitle">Your plan and account.</div>
        </div>
      </header>

      <section className="set-section" aria-label="Plan">
        <div className="op-section">
          <span className="section-label">Plan</span>
        </div>
        <div className="set-card" data-testid="plan-card">
          {plan.plan && (
            <div className="set-plan" data-testid="plan-name">
              {plan.plan}
            </div>
          )}
          <p className={`set-status${plan.kind === 'past_due' || plan.kind === 'payment_required' ? ' warn' : ''}`} data-testid="plan-status">
            {plan.status}
          </p>
          {pausedCount > 0 && (
            <p className="sc-banner set-notice" data-testid="plan-change-notice">
              Careerely paused {pausedCount === 1 ? '1 search' : `${pausedCount} searches`} when your plan changed, to fit its active-search limit.{' '}
              <Link href="/searches">{pausedCount === 1 ? 'Review it on Searches →' : 'Review them on Searches →'}</Link>
            </p>
          )}
          {plan.canManageBilling && (
            <div className="set-actions">
              <ManageBillingButton />
              <span className="set-hint">
                {plan.readOnly && plan.kind !== 'payment_required'
                  ? 'See your invoices and payment history in Stripe.'
                  : 'Change or cancel your plan, update your payment method and see invoices in Stripe.'}
              </span>
            </div>
          )}
          {plan.canSubscribe && (
            <div className="set-subscribe">
              <SubscribeButtons showPrice={false} />
            </div>
          )}
        </div>
      </section>

      <section className="set-section" aria-label="Account">
        <div className="op-section">
          <span className="section-label">Account</span>
        </div>
        <div className="set-card">
          <div className="set-row">
            <div>
              <div className="set-label">Email</div>
              <div className="set-value" data-testid="account-email">
                {user.email}
              </div>
            </div>
          </div>
          <div className="set-row">
            <SignOutButton />
          </div>
        </div>
      </section>

      <section className="set-section" aria-label="Data and privacy">
        <div className="op-section">
          <span className="section-label">Data & privacy</span>
        </div>
        <div className="set-card">
          <div className="set-row">
            <div>
              <div className="set-label">Account deletion</div>
              <div className="set-value">
                Permanently remove your Careerely account and personal data.
              </div>
              <DeleteAccountButton />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

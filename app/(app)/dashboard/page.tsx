import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { getAccount, loadDashboard } from '../../../lib/dashboard'
import { SubscribeButtons } from '../_components/subscribe-buttons'
import { DashboardView } from './dashboard-view'

// Dashboard (design/dashboard-final.html, locked): greeting, stat line, My Pick,
// Also shortlisted, Applications ready, Recent activity.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await getUser()
  if (!user) redirect('/login?next=/dashboard')
  const { checkout } = await searchParams
  const [account, data] = await Promise.all([getAccount(user.id), loadDashboard(user.id)])
  const readOnly = account.access.kind !== 'active'

  return (
    <main className="page">
      {readOnly && (
        <section className="notice">
          {checkout === 'success' ? (
            <p className="notice-text" style={{ marginBottom: 0 }}>
              Payment received. Your plan is being activated; refresh in a moment.
            </p>
          ) : (
            <>
              <h2 className="notice-title">Choose a plan</h2>
              <p className="notice-text">
                {account.access.kind === 'read_only' && account.access.reason === 'no_subscription'
                  ? 'Subscribe to let Careerely search and prepare applications for you.'
                  : 'Your account is read-only. Your applications and documents are still here; subscribe to resume searching and preparing.'}
              </p>
              <SubscribeButtons />
            </>
          )}
        </section>
      )}
      <DashboardView data={data} firstName={account.firstName} readOnly={readOnly} />
    </main>
  )
}

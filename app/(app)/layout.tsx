import { redirect } from 'next/navigation'
import { getUser } from '../../lib/auth'
import { createClient } from '../../lib/supabase/server'
import { getOnboardingPath } from '../../lib/onboarding-server'
import { DASHBOARD_SHORTLIST_ROWS, getAccount, getLiveOpportunities, getScanStatus } from '../../lib/dashboard'
import { initials } from '../../lib/display'
import { TopNav } from './_components/top-nav'
import './app.css'

// Signed-in app shell: top-bar navigation from design/dashboard-final.html (locked).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login?next=/dashboard')
  const path = await getOnboardingPath(await createClient(), user.id)
  if (path !== '/dashboard') redirect(path)

  const [account, { list }, scan] = await Promise.all([getAccount(user.id), getLiveOpportunities(), getScanStatus(user.id)])

  return (
    <div className="cl-app">
      <div className="bg-canvas" aria-hidden>
        <div className="bg-orb1" />
        <div className="bg-orb2" />
      </div>
      <TopNav
        initials={initials(account.firstName, account.lastName, user.email)}
        email={user.email ?? ''}
        badges={{
          // Master Brief → Dashboard: nav badge = My Pick + visible dashboard shortlist rows.
          opportunities: list.length ? 1 + Math.min(list.length - 1, DASHBOARD_SHORTLIST_ROWS) : 0,
          // Master Brief → Applications: count of "Ready to apply".
          applications: list.filter(o => o.readyToApply).length,
        }}
        scan={{ state: scan.state, lastScanAt: scan.lastScanAt }}
      />
      {children}
    </div>
  )
}

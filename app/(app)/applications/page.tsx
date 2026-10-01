import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { getAccount } from '../../../lib/dashboard'
import { loadApplications } from '../../../lib/applications'
import { ApplicationsView } from './applications-view'

// Applications (Master Brief §11): "Ready to apply" first, then "Your
// applications" with manual status tracking. No Kanban, CRM or analytics.
export default async function ApplicationsPage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/applications')
  const [account, data] = await Promise.all([getAccount(user.id), loadApplications()])
  return (
    <main className="page">
      <ApplicationsView data={data} readOnly={account.access.kind !== 'active'} />
    </main>
  )
}

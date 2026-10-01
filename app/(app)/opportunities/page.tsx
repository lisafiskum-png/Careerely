import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { getAccount } from '../../../lib/dashboard'
import { loadOpportunities } from '../../../lib/opportunities'
import { OpportunitiesView } from './opportunities-view'

// Opportunities (Master Brief §10): everything Careerely currently shortlists,
// My Pick featured, then "Also shortlisted". No filters, search or sorting (V1).
export default async function OpportunitiesPage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/opportunities')
  const [account, data] = await Promise.all([getAccount(user.id), loadOpportunities(user.id)])
  return (
    <main className="page">
      <OpportunitiesView data={data} readOnly={account.access.kind !== 'active'} />
    </main>
  )
}

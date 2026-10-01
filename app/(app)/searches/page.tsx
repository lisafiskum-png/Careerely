import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { getAccount } from '../../../lib/dashboard'
import { loadSearches } from '../../../lib/searches'
import { SearchesView } from './searches-view'

// Searches (Master Brief §12): what Careerely is hunting for on the user's
// behalf. Missions, not filter configurations; no charts or analytics.
export default async function SearchesPage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/searches')
  const account = await getAccount(user.id)
  const data = await loadSearches(user.id, account.access)
  const readOnly = account.access.kind !== 'active'
  return (
    <main className="page">
      {readOnly && (
        <section className="notice" data-testid="read-only-notice">
          <p className="notice-text" style={{ marginBottom: 0 }}>
            Your account is read-only. Your searches are kept, but Careerely isn’t scanning for them. Subscribe to resume searching.
          </p>
        </section>
      )}
      <SearchesView data={data} readOnly={readOnly} />
    </main>
  )
}

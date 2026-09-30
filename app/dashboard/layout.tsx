import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '../../lib/auth'
import { createClient } from '../../lib/supabase/server'
import { getOnboardingPath } from '../../lib/onboarding-server'
import { SignOutButton } from './_components/sign-out-button'

// App shell (Master Brief → Visual design: sticky left sidebar, 220px).
// Phase D adds Opportunities, Applications and Searches to the navigation.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login?next=/dashboard')
  const path = await getOnboardingPath(await createClient(), user.id)
  if (path !== '/dashboard') redirect(path)

  return (
    <div className="min-h-screen bg-app text-ink md:grid md:grid-cols-[var(--sidebar-width)_1fr]">
      <aside className="border-b border-line md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-8 px-5 py-6">
          <Link href="/dashboard" className="text-[15px] font-semibold tracking-[-0.02em]">
            Careerely
          </Link>
          <nav className="flex flex-col gap-1 text-[13px]">
            <Link href="/dashboard" className="rounded-[var(--radius-card)] bg-pu-tint px-3 py-2 font-medium text-pu">
              Dashboard
            </Link>
          </nav>
          <div className="mt-auto flex flex-col gap-2 text-[12px] text-zinc-500">
            <span className="truncate">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-8 md:px-12 md:py-12">{children}</main>
    </div>
  )
}

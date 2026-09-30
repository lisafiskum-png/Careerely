import { redirect } from 'next/navigation'
import { getUser } from '../../lib/auth'
import { createClient } from '../../lib/supabase/server'
import { getOnboardingPath } from '../../lib/onboarding-server'

// Sends the user to the step they should continue from.
export default async function OnboardingIndex() {
  const user = await getUser()
  if (!user) redirect('/login')
  redirect(await getOnboardingPath(await createClient(), user.id))
}

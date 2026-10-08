import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { createClient } from '../../../lib/supabase/server'
import { OnboardingShell } from '../../../components/onboarding/shell'
import { ResumeStep } from './resume-step'

export const metadata: Metadata = { title: 'Careerely — Upload your resume' }

export default async function ResumePage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/onboarding/2')

  const supabase = await createClient()
  const { data: profile, error } = await supabase.from('profiles')
    .select('onboarding_completed_at').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (profile?.onboarding_completed_at) redirect('/dashboard')

  // Returning unfinished accounts restart with an upload. A previous draft
  // must not silently turn a fresh onboarding visit into "Review your profile".
  // Parsing/review within this visit remains in ResumeStep's client state.
  return (
    <OnboardingShell>
      <ResumeStep userId={user.id} draft={null} />
    </OnboardingShell>
  )
}

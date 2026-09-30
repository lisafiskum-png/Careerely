import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { createClient } from '../../../lib/supabase/server'
import { ResumeSchema, type Resume } from '../../../lib/resume/schema'
import { OnboardingShell } from '../../../components/onboarding/shell'
import { ResumeStep } from './resume-step'

export const metadata: Metadata = { title: 'Careerely — Upload your resume' }

export default async function ResumePage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/onboarding/2')

  const supabase = await createClient()
  const [{ data: profile }, { data: career }] = await Promise.all([
    supabase.from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle(),
    supabase.from('career_profiles').select('resume_data').eq('user_id', user.id).maybeSingle(),
  ])
  if (profile?.onboarding_completed_at) redirect('/dashboard')

  // A parsed (or previously confirmed) resume reopens in the review state.
  const draft = ResumeSchema.safeParse(career?.resume_data)
  const initial: Resume | null = draft.success ? draft.data : null

  return (
    <OnboardingShell>
      <ResumeStep userId={user.id} draft={initial} />
    </OnboardingShell>
  )
}

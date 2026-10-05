import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '../../../lib/auth'
import { createClient } from '../../../lib/supabase/server'
import { isWorkStyle } from '../../../lib/onboarding'
import { isPlanId } from '../../../lib/plans'
import { PreferencesStep, type PreferencesInitial } from './preferences-step'

export const metadata: Metadata = { title: 'Careerely — Your next move' }

type Suggestions = { roles?: string[]; industries?: string[]; highlights?: string[] }

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>
}) {
  const { checkout, session_id: sessionId } = await searchParams
  const user = await getUser()
  if (!user) redirect('/login?next=/onboarding/3')

  const supabase = await createClient()
  const [{ data: profile }, { data: career }] = await Promise.all([
    supabase.from('profiles').select('onboarding_completed_at, selected_plan').eq('id', user.id).maybeSingle(),
    supabase
      .from('career_profiles')
      .select('target_roles, industries, work_styles, locations, suggestions, resume_confirmed_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!career?.resume_confirmed_at) redirect('/onboarding/2')
  // Finished users go to the dashboard, except when returning from checkout
  // (the page then confirms the payment and shows the success screen).
  if (profile?.onboarding_completed_at && checkout !== 'success') redirect('/dashboard')

  const suggestions = (career.suggestions ?? {}) as Suggestions
  const saved = career.target_roles.length > 0
  const initial: PreferencesInitial = {
    roles: saved ? career.target_roles : (suggestions.roles ?? []),
    industries: saved ? career.industries : (suggestions.industries ?? []),
    workStyles: saved && career.work_styles.length ? career.work_styles.filter(isWorkStyle) : ['on_site'],
    locations: saved ? career.locations : [],
    aiRoles: suggestions.roles ?? [],
    aiIndustries: suggestions.industries ?? [],
    highlights: suggestions.highlights ?? [],
    // The analysing sequence plays once, before the user has saved anything.
    animateIn: !saved,
  }

  return (
    <PreferencesStep
      initial={initial}
      selectedPlan={isPlanId(profile?.selected_plan) ? profile.selected_plan : null}
      checkout={checkout === 'success' || checkout === 'cancelled' ? checkout : null}
      sessionId={sessionId ?? null}
    />
  )
}

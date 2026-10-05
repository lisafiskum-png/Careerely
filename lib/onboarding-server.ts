import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nextOnboardingPath, type OnboardingPath } from './onboarding'

/** Reads the signed-in user's onboarding progress (RLS: own rows only). */
export async function getOnboardingPath(supabase: SupabaseClient, userId: string): Promise<OnboardingPath> {
  const [{ data: profile, error: profileError }, { data: career, error: careerError }] = await Promise.all([
    supabase.from('profiles').select('onboarding_completed_at').eq('id', userId).maybeSingle(),
    supabase.from('career_profiles').select('resume_confirmed_at').eq('user_id', userId).maybeSingle(),
  ])
  if (profileError) throw profileError
  if (careerError) throw careerError
  return nextOnboardingPath({
    completed: Boolean(profile?.onboarding_completed_at),
    hasResume: Boolean(career?.resume_confirmed_at),
  })
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasCompletedOnboarding, nextOnboardingPath, type OnboardingPath } from './onboarding'

/** Reads the signed-in user's onboarding progress (RLS: own rows only). */
export async function getOnboardingPath(supabase: SupabaseClient, userId: string): Promise<OnboardingPath> {
  const [{ data: profile }, { data: career }] = await Promise.all([
    supabase.from('profiles').select('onboarding_completed_at').eq('id', userId).maybeSingle(),
    supabase.from('career_profiles').select('resume_confirmed_at, target_roles, work_styles').eq('user_id', userId).maybeSingle(),
  ])
  return nextOnboardingPath({
    completed: hasCompletedOnboarding({
      completed: Boolean(profile?.onboarding_completed_at),
      hasResume: Boolean(career?.resume_confirmed_at),
      roles: career?.target_roles ?? [],
      workStyles: career?.work_styles ?? [],
    }),
    hasResume: Boolean(career?.resume_confirmed_at),
  })
}

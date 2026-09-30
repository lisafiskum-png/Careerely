import type { Metadata } from 'next'
import { isPlanId } from '../../lib/plans'
import { OnboardingShell, SignInLink } from '../../components/onboarding/shell'
import { SignupForm } from './signup-form'

export const metadata: Metadata = { title: 'Careerely — Get Started' }

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; email?: string }> }) {
  const { plan, email } = await searchParams
  return (
    <OnboardingShell right={<SignInLink />}>
      <SignupForm selectedPlan={isPlanId(plan) ? plan : null} initialEmail={typeof email === 'string' ? email.slice(0, 200) : ''} />
    </OnboardingShell>
  )
}

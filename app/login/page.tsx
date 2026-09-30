import type { Metadata } from 'next'
import Link from 'next/link'
import { safeNextPath } from '../../lib/onboarding'
import { OnboardingShell } from '../../components/onboarding/shell'
import s from '../../components/onboarding/onboarding.module.css'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Careerely — Sign in' }

const NOTICES: Record<string, string> = {
  password_updated: 'Your password has been updated. Sign in with your new password.',
  link_invalid: 'That link has expired or was already used. Sign in, or request a new link.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const { next, notice } = await searchParams
  return (
    <OnboardingShell
      right={
        <p className={s.signinLink}>
          New to Careerely? <Link href="/signup">Create an account</Link>
        </p>
      }
    >
      <LoginForm next={safeNextPath(next)} notice={notice ? NOTICES[notice] : undefined} />
    </OnboardingShell>
  )
}

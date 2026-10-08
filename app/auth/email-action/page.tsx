import type { Metadata } from 'next'
import Link from 'next/link'
import { OnboardingShell } from '../../../components/onboarding/shell'
import { safeNextPath } from '../../../lib/onboarding'
import s from '../../../components/onboarding/onboarding.module.css'

export const metadata: Metadata = {
  title: 'Careerely — Secure email link',
  robots: { index: false, follow: false },
}

type EmailActionType = 'email' | 'recovery'

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function EmailActionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawType = valueOf(params.type)
  const type: EmailActionType | null = rawType === 'email' || rawType === 'recovery' ? rawType : null
  const tokenHash = valueOf(params.token_hash) || ''
  const invalid = valueOf(params.error) === 'link_invalid' || !type || !tokenHash || tokenHash.length > 4096
  const recovery = type === 'recovery'

  return (
    <OnboardingShell>
      <div className={s.step}>
        {invalid ? (
          <>
            <h1>This link has expired</h1>
            <p className={s.sub}>Email links can only be used once. Request a new link and try again.</p>
            <Link href={recovery ? '/forgot-password' : '/signup'} className={s.textLink}>
              {recovery ? 'Request a new password reset' : 'Start again'}
            </Link>
          </>
        ) : (
          <form method="post" action="/auth/confirm">
            <h1>{recovery ? 'Reset your password' : 'Confirm your email'}</h1>
            <p className={s.sub}>
              {recovery
                ? 'Continue to choose a new password for your Careerely account.'
                : 'Continue to verify your email address and finish setting up Careerely.'}
            </p>
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input
              type="hidden"
              name="next"
              value={recovery ? '/reset-password' : safeNextPath(valueOf(params.next), '/dashboard')}
            />
            <button type="submit" className={s.btnPrimary}>
              {recovery ? 'Continue to reset password' : 'Confirm email'}
            </button>
          </form>
        )}
      </div>
    </OnboardingShell>
  )
}

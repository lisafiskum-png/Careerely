import Link from 'next/link'
import { OnboardingShell } from '../components/onboarding/shell'
import s from '../components/onboarding/onboarding.module.css'

// Unknown URLs, and opportunities or pages that don't exist (or aren't yours).
export default function NotFound() {
  return (
    <OnboardingShell>
      <div className={s.step}>
        <h1>Page not found</h1>
        <p className={s.sub}>This page doesn’t exist or is no longer available.</p>
        <Link href="/dashboard" className={s.btnPrimary} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Go to your dashboard
        </Link>
      </div>
    </OnboardingShell>
  )
}

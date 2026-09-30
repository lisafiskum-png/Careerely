import Link from 'next/link'
import s from './onboarding.module.css'

// Page frame from design/onboarding-step1-step2-final.html: logo left, an
// optional right-hand element (e.g. "Already have an account? Sign in"),
// content centred in a 480px column.
export function OnboardingShell({
  right,
  wide = false,
  children,
}: {
  right?: React.ReactNode
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={s.page}>
      <header>
        <div className={s.navIn}>
          <Link href="/" className={s.logo}>
            Career<span className={s.ely}>ely</span>
          </Link>
          {right}
        </div>
      </header>
      <div className={s.center}>
        <div className={wide ? s.cardWide : s.card}>{children}</div>
      </div>
    </div>
  )
}

export function SignInLink() {
  return (
    <p className={s.signinLink}>
      Already have an account? <Link href="/login">Sign in</Link>
    </p>
  )
}

export function ProgressDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className={s.progress} aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map(i => (
        <div key={i} className={`${s.dot} ${i < step ? s.dotDone : ''} ${i === step ? s.dotActive : ''}`} />
      ))}
    </div>
  )
}

export function CheckIcon({ size = 24, stroke = '#5B21B6', width = 2 }: { size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

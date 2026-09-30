'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { isValidEmail, MIN_PASSWORD_LENGTH, splitFullName } from '../../lib/onboarding'
import type { PlanId } from '../../lib/plans'
import { LegalModal, type LegalKind } from '../../components/onboarding/legal-modal'
import { CheckIcon, ProgressDots } from '../../components/onboarding/shell'
import s from '../../components/onboarding/onboarding.module.css'

// Step 1 — Account creation (design/onboarding-step1-step2-final.html, LOCKED).
export function SignupForm({ selectedPlan, initialEmail = '' }: { selectedPlan: PlanId | null; initialEmail?: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [legal, setLegal] = useState<LegalKind | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { first, last } = splitFullName(name)
    if (!first) return setError('Please enter your name.')
    if (!isValidEmail(email)) return setError('Please enter a valid email address.')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (!agreed) return setError('Please accept the Terms of Service and Privacy Policy.')

    setPending(true)
    const { data, error: signUpError } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding/2`,
        data: {
          first_name: first,
          last_name: last,
          terms_accepted: 'true',
          ...(selectedPlan ? { selected_plan: selectedPlan } : {}),
        },
      },
    })
    if (signUpError) {
      setPending(false)
      return setError(signUpError.message)
    }
    if (data.session) {
      router.push('/onboarding/2')
      router.refresh()
      return
    }
    // Email confirmation is required before the account can be used.
    setPending(false)
    setSentTo(email.trim())
  }

  async function resend() {
    if (!sentTo) return
    setError('')
    const { error: resendError } = await createClient().auth.resend({
      type: 'signup',
      email: sentTo,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding/2` },
    })
    if (resendError) setError(resendError.message)
    else setResent(true)
  }

  if (sentTo) {
    return (
      <div className={`${s.step} ${s.centered}`}>
        <div className={s.successIcon}>
          <CheckIcon />
        </div>
        <h1>Check your email</h1>
        <p className={s.sub} style={{ maxWidth: 360, margin: '12px auto 32px' }}>
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it to continue setting up your account.
        </p>
        <button type="button" className={s.textLink} onClick={resend} disabled={resent}>
          {resent ? 'Sent again' : 'Resend the email'}
        </button>
        <p className={s.error} role="alert">
          {error}
        </p>
      </div>
    )
  }

  return (
    <>
      <ProgressDots step={1} />
      <form className={s.step} onSubmit={submit} noValidate>
        <p className={s.stepLabel}>Step 1 of 3</p>
        <h1>Create your account</h1>
        <p className={s.sub}>Your next opportunity starts here.</p>
        <div className={s.field}>
          <label htmlFor="name">Full name</label>
          <input className={s.inp} id="name" type="text" placeholder="Your name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className={s.field}>
          <label htmlFor="email">Email</label>
          <input className={s.inp} id="email" type="email" placeholder="you@email.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className={s.field}>
          <label htmlFor="pass">Password</label>
          <div className={s.inpWrap}>
            <input
              className={s.inp}
              id="pass"
              type={showPassword ? 'text' : 'password'}
              placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button type="button" className={s.inpToggle} onClick={() => setShowPassword(v => !v)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button type="submit" className={s.btnPrimary} disabled={!agreed || pending}>
          {pending ? 'Creating your account…' : 'Continue'}
        </button>
        <div className={s.agree}>
          <input type="checkbox" id="agreeCheck" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
          <label htmlFor="agreeCheck">
            I agree to the{' '}
            <button type="button" className={s.inlineLink} onClick={() => setLegal('terms')}>
              Terms of Service
            </button>{' '}
            and{' '}
            <button type="button" className={s.inlineLink} onClick={() => setLegal('privacy')}>
              Privacy Policy
            </button>
          </label>
        </div>
        <p className={s.error} role="alert">
          {error}
        </p>
      </form>
      <LegalModal open={legal} onClose={() => setLegal(null)} />
    </>
  )
}

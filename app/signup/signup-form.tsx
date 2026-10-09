'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { authErrorMessage } from '../../lib/auth-errors'
import { isValidEmail, MIN_PASSWORD_LENGTH, splitFullName } from '../../lib/onboarding'
import type { PlanId } from '../../lib/plans'
import { LegalModal, type LegalKind } from '../../components/onboarding/legal-modal'
import { ProgressDots } from '../../components/onboarding/shell'
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { first } = splitFullName(name)
    if (!first) return setError('Please enter your name.')
    if (!isValidEmail(email)) return setError('Please enter a valid email address.')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (!agreed) return setError('Please accept the Terms of Service and Privacy Policy.')

    setPending(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: normalizedEmail, password, selectedPlan, agreed: true }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) return setError(result.error || 'We couldn’t create your account. Please try again.')

      const { error: signInError } = await createClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })
      if (signInError) {
        return setError('Your account was created, but we couldn’t continue automatically. Please use Log in.')
      }
      router.push('/onboarding/2')
      router.refresh()
    } catch (error) {
      setError(authErrorMessage(error, 'Something went wrong. Please try again.'))
    } finally {
      setPending(false)
    }
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

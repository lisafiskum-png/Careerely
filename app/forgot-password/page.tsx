'use client'
import { useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import { isValidEmail } from '../../lib/onboarding'
import { CheckIcon, OnboardingShell, SignInLink } from '../../components/onboarding/shell'
import s from '../../components/onboarding/onboarding.module.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!isValidEmail(email)) return setError('Please enter a valid email address.')
    setPending(true)
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    })
    setPending(false)
    // Same message whether or not the account exists, so emails can't be probed.
    if (resetError && resetError.status !== 429) return setError('Something went wrong. Please try again.')
    if (resetError) return setError('Too many requests. Please wait a minute and try again.')
    setSent(true)
  }

  return (
    <OnboardingShell right={<SignInLink />}>
      {sent ? (
        <div className={`${s.step} ${s.centered}`}>
          <div className={s.successIcon}>
            <CheckIcon />
          </div>
          <h1>Check your email</h1>
          <p className={s.sub} style={{ maxWidth: 360, margin: '12px auto 0' }}>
            If an account exists for <strong>{email.trim()}</strong>, we sent a link to reset your password.
          </p>
        </div>
      ) : (
        <form className={s.step} onSubmit={submit} noValidate>
          <h1>Reset your password</h1>
          <p className={s.sub}>Enter your email and we’ll send you a link to choose a new password.</p>
          <div className={s.field}>
            <label htmlFor="email">Email</label>
            <input className={s.inp} id="email" type="email" placeholder="you@email.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <button type="submit" className={s.btnPrimary} disabled={pending}>
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
          <p className={s.error} role="alert">
            {error}
          </p>
        </form>
      )}
    </OnboardingShell>
  )
}

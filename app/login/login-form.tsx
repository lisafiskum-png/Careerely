'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { isValidEmail } from '../../lib/onboarding'
import { authErrorMessage } from '../../lib/auth-errors'
import s from '../../components/onboarding/onboarding.module.css'

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!isValidEmail(email)) return setError('Please enter a valid email address.')
    if (!password) return setError('Please enter your password.')
    setPending(true)
    try {
      const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) {
        return setError(authErrorMessage(signInError, 'That email and password don’t match an account.'))
      }
      router.push(next)
      router.refresh()
    } catch (error) {
      setError(authErrorMessage(error, 'Something went wrong. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={s.step} onSubmit={submit} noValidate>
      <h1>Welcome back</h1>
      <p className={s.sub}>Sign in to continue to Careerely.</p>
      {notice && <p className={s.notice} style={{ marginTop: -24, marginBottom: 24 }}>{notice}</p>}
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
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button type="button" className={s.inpToggle} onClick={() => setShowPassword(v => !v)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <button type="submit" className={s.btnPrimary} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className={s.error} role="alert">
        {error}
      </p>
      <p className={s.notice} style={{ textAlign: 'center' }}>
        <Link href="/forgot-password" className={s.textLink}>
          Forgot your password?
        </Link>
      </p>
    </form>
  )
}

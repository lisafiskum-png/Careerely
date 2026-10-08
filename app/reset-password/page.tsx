'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../lib/supabase/client'
import { authErrorMessage } from '../../lib/auth-errors'
import { MIN_PASSWORD_LENGTH } from '../../lib/onboarding'
import { OnboardingShell } from '../../components/onboarding/shell'
import s from '../../components/onboarding/onboarding.module.css'

// Reached from the password reset email via /auth/confirm, which signs the
// user in with a recovery session.
export default function ResetPasswordPage() {
  const router = useRouter()
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => createClient().auth.getUser()).then(({ data, error }) => {
      if (cancelled) return
      if (error && (!error.status || error.status >= 500)) {
        setError(authErrorMessage(error, 'We couldn’t verify this link. Please try again.'))
      }
      setHasSession(Boolean(data.user))
    }).catch(error => {
      if (cancelled) return
      setError(authErrorMessage(error, 'We couldn’t verify this link. Please try again.'))
      setHasSession(false)
    })
    return () => { cancelled = true }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== confirm) return setError('The two passwords don’t match.')
    setPending(true)
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password })
      if (updateError) {
        return setError(authErrorMessage(updateError,
          updateError.code === 'same_password' ? 'Choose a password you haven’t used before.' : updateError.message,
        ))
      }
      // The update has already succeeded. Cleanup errors must not invite the
      // user to repeat a password change that is now effective.
      await createClient().auth.signOut({ scope: 'global' }).catch(() => undefined)
      router.push('/login?notice=password_updated')
    } catch (error) {
      setError(authErrorMessage(error, 'Something went wrong. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <OnboardingShell>
      {hasSession === false ? (
        <div className={s.step}>
          <h1>{error ? 'We couldn’t verify your link' : 'This link has expired'}</h1>
          <p className={s.sub}>{error || 'Password reset links can only be used once and expire after an hour.'}</p>
          {error && <button type="button" className={s.btnPrimary} onClick={() => window.location.reload()}>Try again</button>}
          <Link href="/forgot-password" className={s.textLink}>
            Request a new link
          </Link>
        </div>
      ) : (
        <form className={s.step} onSubmit={submit} noValidate>
          <h1>Choose a new password</h1>
          <p className={s.sub}>You’ll use it to sign in to Careerely from now on.</p>
          <div className={s.field}>
            <label htmlFor="pass">New password</label>
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
          <div className={s.field}>
            <label htmlFor="confirm">Confirm new password</label>
            <input
              className={s.inp}
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>
          <button type="submit" className={s.btnPrimary} disabled={pending || hasSession === null}>
            {pending ? 'Saving…' : 'Update password'}
          </button>
          <p className={s.error} role="alert">
            {error}
          </p>
        </form>
      )}
    </OnboardingShell>
  )
}

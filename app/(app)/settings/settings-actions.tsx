'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '../../../lib/supabase/client'
import styles from './settings.module.css'

/** Opens Stripe's Customer Portal for this account (the server picks the customer). */
export function ManageBillingButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function open() {
    setPending(true)
    setError('')
    const res = await fetch('/api/billing/portal', { method: 'POST' }).catch(() => null)
    const data = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null
    if (res?.ok && data?.url) {
      window.location.assign(data.url)
      return
    }
    setPending(false)
    setError(data?.error ?? 'Couldn’t open billing. Please try again.')
  }

  return (
    <>
      <button className="btn-create" onClick={open} disabled={pending}>
        {pending ? 'Opening…' : 'Manage billing'}
      </button>
      {error && (
        <span className="ft-error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  async function signOut() {
    setPending(true)
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }
  return (
    <button className="btn-ghost set-signout" onClick={signOut} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
export function DeleteAccountButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  function close() {
    if (pending) return
    setOpen(false)
    setPassword('')
    setConfirmation('')
    setError('')
  }

  async function removeAccount() {
    if (confirmation !== 'DELETE' || !password) return
    setPending(true)
    setError('')

    const response = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation, password }),
    }).catch(() => null)
    const data = (await response?.json().catch(() => null)) as { deleted?: boolean; error?: string } | null

    if (response?.ok && data?.deleted) {
      // The Auth user no longer exists; clear the local browser session before
      // leaving the signed-in app shell.
      await createClient().auth.signOut().catch(() => undefined)
      router.push('/')
      router.refresh()
      return
    }

    setPending(false)
    setError(data?.error ?? 'We couldn’t delete your account. Please try again.')
  }

  if (!open) {
    return (
      <button className={`btn-ghost ${styles.deleteTrigger}`} onClick={() => setOpen(true)}>
        Remove my account
      </button>
    )
  }

  return (
    <div className={styles.deletePanel} data-testid="delete-account-panel">
      <p className={styles.deleteWarning}>
        This permanently deletes your Careerely account, resume, matches and application data. Any active subscription is cancelled immediately. This cannot be undone.
      </p>

      <div className={styles.field}>
        <label htmlFor="delete-account-password">Current password</label>
        <input
          id="delete-account-password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          disabled={pending}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="delete-account-confirmation">Type DELETE to confirm</label>
        <input
          id="delete-account-confirmation"
          className={styles.input}
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={confirmation}
          onChange={event => setConfirmation(event.target.value)}
          disabled={pending}
        />
      </div>

      <div className={styles.actions}>
        <button
          className={styles.deleteButton}
          type="button"
          onClick={removeAccount}
          disabled={pending || !password || confirmation !== 'DELETE'}
        >
          {pending ? 'Deleting…' : 'Permanently delete account'}
        </button>
        <button className="btn-ghost" type="button" onClick={close} disabled={pending}>
          Cancel
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

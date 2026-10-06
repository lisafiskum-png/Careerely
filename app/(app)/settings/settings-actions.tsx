'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '../../../lib/supabase/client'

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
export function DeleteAccount() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    if (confirmation !== 'DELETE') return
    setPending(true)
    setError('')
    const response = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    }).catch(() => null)
    const data = await response?.json().catch(() => null) as { deleted?: boolean; error?: string } | null
    if (response?.ok && data?.deleted) {
      await createClient().auth.signOut()
      router.push('/')
      router.refresh()
      return
    }
    setPending(false)
    setError(data?.error ?? 'Couldn’t delete the account. Please try again.')
  }

  if (!open) {
    return <button className="btn-ghost set-signout" onClick={() => setOpen(true)}>Delete account</button>
  }

  return (
    <div className="set-delete">
      <p className="set-status warn">
        This permanently deletes your profile, searches and applications. Any active subscription is cancelled immediately. This cannot be undone.
      </p>
      <label className="set-label" htmlFor="delete-confirmation">Type DELETE to confirm</label>
      <input
        id="delete-confirmation"
        className="set-delete-input"
        value={confirmation}
        onChange={event => setConfirmation(event.target.value)}
        autoComplete="off"
      />
      <div className="set-delete-actions">
        <button className="btn-ghost" onClick={() => { setOpen(false); setConfirmation(''); setError('') }} disabled={pending}>Keep account</button>
        <button className="btn-danger" onClick={remove} disabled={pending || confirmation !== 'DELETE'}>
          {pending ? 'Deleting…' : 'Permanently delete'}
        </button>
      </div>
      {error && <span className="ft-error" role="alert">{error}</span>}
    </div>
  )
}

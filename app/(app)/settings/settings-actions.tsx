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

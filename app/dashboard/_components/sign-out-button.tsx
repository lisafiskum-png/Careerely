'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '../../../lib/supabase/client'

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
    <button onClick={signOut} disabled={pending} className="text-left hover:text-ink disabled:opacity-60">
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

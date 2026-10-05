'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import s from '../landing.module.css'
import x from './landing-controls.module.css'

// "Email address + Get Started": continues to signup with the email filled in.
// If this browser already has a Careerely session, do not pretend a different
// email starts a different account: show a clear route back to the signed-in app.
export function JoinForm({ className }: { className: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session))
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (signedIn) {
    return (
      <div className={`${className} ${x.signedInJoin}`}>
        <span className={x.sessionNote}>You’re already signed in.</span>
        <button type="button" className={s.btnDark} onClick={() => router.push('/dashboard')}>
          Open Careerely
        </button>
      </div>
    )
  }

  return (
    <form
      className={className}
      onSubmit={async e => {
        e.preventDefault()
        // Re-check at submit time as well, so a session established in another
        // tab cannot turn an email field into a misleading route to that account.
        const { data } = await createClient().auth.getSession()
        if (data.session) {
          setSignedIn(true)
          return
        }
        const value = email.trim()
        router.push(value ? `/signup?email=${encodeURIComponent(value)}` : '/signup')
      }}
    >
      <input
        className={s.inp}
        type="email"
        placeholder="Email address"
        aria-label="Email address"
        autoComplete="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <button type="submit" className={s.btnDark}>
        Get Started
      </button>
    </form>
  )
}

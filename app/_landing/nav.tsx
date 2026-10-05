'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import s from '../landing.module.css'
import x from './landing-controls.module.css'

// Transparent → frosted glass on scroll. Signed-out visitors always get an
// explicit Log in action; signed-in visitors get a clear way back to the app
// instead of being sent through sign-up again.
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  return (
    <nav className={`${s.nav} ${scrolled ? s.navScrolled : ''}`}>
      <div className={`${s.wrap} ${s.navIn}`}>
        <Link href="/" className={s.logo}>
          Career<span className={s.ely}>ely</span>
        </Link>
        <div className={s.navLinks}>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className={x.navActions}>
          {signedIn ? (
            <Link href="/dashboard" className={x.navLogin}>
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className={x.navLogin}>
              Log in
            </Link>
          )}
          <Link href={signedIn ? '/dashboard' : '/signup'} className={s.navCta}>
            {signedIn ? 'Open Careerely' : 'Get Started'}
          </Link>
        </div>
      </div>
    </nav>
  )
}

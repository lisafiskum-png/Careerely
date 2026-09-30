'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import s from '../landing.module.css'

// Transparent → frosted glass on scroll (reference nav behaviour).
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
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
        <Link href="/signup" className={s.navCta}>
          Get Started
        </Link>
      </div>
    </nav>
  )
}

'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '../../../lib/supabase/client'
import type { ScanStatus } from '../../../lib/dashboard'
import { RelTime } from './rel-time'

type Tab = { label: string; href: string; built: boolean; badge?: number }

export function TopNav({
  initials,
  email,
  badges,
  scan,
}: {
  initials: string
  email: string
  badges: { opportunities: number; applications: number }
  scan: ScanStatus
}) {
  const pathname = usePathname()
  // Searches, Applications and Settings are built in later Phase D steps.
  const tabs: Tab[] = [
    { label: 'Dashboard', href: '/dashboard', built: true },
    { label: 'Searches', href: '/searches', built: false },
    { label: 'Opportunities', href: '/opportunities', built: true, badge: badges.opportunities },
    { label: 'Applications', href: '/applications', built: false, badge: badges.applications },
    { label: 'Settings', href: '/settings', built: false },
  ]

  return (
    <nav className="nav" aria-label="Main">
      <Link href="/dashboard" className="nav-brand" aria-label="Careerely dashboard">
        <span className="nav-mark" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
          </svg>
        </span>
        <span className="nav-wm">
          Career<em>ely</em>
        </span>
      </Link>
      <div className="nav-pipe" />
      <div className="nav-status" aria-live="polite">
        <span className={`sdot ${scan.state === 'scanning' ? 'live' : scan.state === 'never' ? 'idle' : ''}`} aria-hidden />
        <span className="stext" data-testid="scan-status">
          {scan.state === 'scanning' ? (
            'Scanning the market'
          ) : scan.lastScanAt ? (
            <>
              Last scan <RelTime iso={scan.lastScanAt} />
            </>
          ) : (
            'No scans yet'
          )}
        </span>
      </div>
      <div className="nav-pipe" />
      <div className="nav-tabs">
        {tabs.map(tab => {
          const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          const badge = tab.badge ? <span className="nbadge">{tab.badge}</span> : null
          return tab.built ? (
            <Link key={tab.href} href={tab.href} className={`ntab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
              {tab.label}
              {badge}
            </Link>
          ) : (
            <span key={tab.href} className="ntab soon" aria-disabled="true">
              {tab.label}
              {badge}
            </span>
          )
        })}
      </div>
      <AccountMenu initials={initials} email={email} />
    </nav>
  )
}

function AccountMenu({ initials, email }: { initials: string; email: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  async function signOut() {
    setPending(true)
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="av-wrap" ref={ref}>
      <button className="nav-av" aria-label="Account" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {initials}
      </button>
      {open && (
        <div className="av-menu" role="menu">
          <div className="av-email">{email}</div>
          <button className="av-item" role="menuitem" onClick={signOut} disabled={pending}>
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}

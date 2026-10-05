'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

const REFRESH_MS = 3_000

function userIsEditing() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.matches('input, textarea, select, [contenteditable="true"]')
}

/**
 * Keep server-rendered Careerely data live without requiring a manual browser
 * refresh. Next.js preserves client component state across router.refresh(), so
 * open panels/forms stay usable; we also avoid refreshing while the user is
 * actively typing.
 */
export function LiveRefresh() {
  const router = useRouter()
  const last = useRef(0)

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || userIsEditing()) return
      const now = Date.now()
      if (now - last.current < 1_000) return
      last.current = now
      router.refresh()
    }

    const timer = window.setInterval(refresh, REFRESH_MS)
    const onFocus = () => refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router])

  return null
}

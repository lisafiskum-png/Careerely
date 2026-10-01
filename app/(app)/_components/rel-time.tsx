'use client'
import { useEffect, useState } from 'react'
import { relativeTime } from '../../../lib/display'

/** Relative time in the viewer's clock, refreshed every minute. */
export function RelTime({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {relativeTime(iso, now)}
    </time>
  )
}

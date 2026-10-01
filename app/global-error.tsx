'use client'
import { useEffect } from 'react'

// Last-resort error page (the root layout itself failed). It replaces the root
// layout, so it brings its own document and minimal inline styles.
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F4F1', color: '#0E0E0E', fontFamily: 'system-ui, sans-serif' }}>
        <title>Careerely — Something went wrong</title>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 620, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#5A5A5A', margin: '0 0 20px' }}>Careerely couldn’t load. Please try again.</p>
          <button onClick={() => unstable_retry()} style={{ height: 38, padding: '0 18px', borderRadius: 999, border: 'none', background: '#0E0E0E', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}

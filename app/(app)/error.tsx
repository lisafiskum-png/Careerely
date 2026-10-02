'use client'
import { useEffect } from 'react'

// Unexpected errors inside the signed-in app: keep the nav, say what happened,
// offer a retry. Server errors only show their digest, never details.
export default function AppError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="page">
      <div className="empty-block" role="alert" data-testid="app-error">
        <h1 className="empty-title">Something went wrong</h1>
        <p className="empty-desc">This page couldn’t load. Please try again.</p>
        <button className="btn-create" style={{ margin: '20px auto 0' }} onClick={() => unstable_retry()}>
          Try again
        </button>
      </div>
    </main>
  )
}

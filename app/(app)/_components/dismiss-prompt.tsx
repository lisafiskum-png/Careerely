'use client'
import { useEffect, useRef } from 'react'

// "Not for me" confirmation (decision 2026-10-01). V1 has no undo, so nothing
// is dismissed until the user picks a reason or "Dismiss without a reason".
// Cancel (or Escape) leaves everything unchanged.

export const DISMISS_REASONS = [
  ['role', 'Role'],
  ['company', 'Company'],
  ['location', 'Location'],
  ['salary', 'Salary'],
  ['industry', 'Industry'],
  ['other', 'Other'],
] as const

export type DismissReason = (typeof DISMISS_REASONS)[number][0]

export function DismissPrompt({ onConfirm, onCancel }: { onConfirm: (reason: DismissReason | null) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="reason-picker" ref={ref} role="group" aria-label="Not for me" data-testid="dismiss-prompt" onClick={e => e.stopPropagation()}>
      <span className="reason-label">Not for me? Why not (optional):</span>
      {DISMISS_REASONS.map(([value, label]) => (
        <button key={value} className="reason-btn" onClick={() => onConfirm(value)}>
          {label}
        </button>
      ))}
      <button className="reason-btn" onClick={() => onConfirm(null)}>
        Dismiss without a reason
      </button>
      <button className="reason-skip" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

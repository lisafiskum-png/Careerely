'use client'
import { useState } from 'react'
import { PLANS, type PlanId } from '../../../lib/plans'

// Minimal plan picker so billing can be tested end to end.
// The real upgrade flow and customer portal are built in Phase E.
export function SubscribeButtons() {
  const [pending, setPending] = useState<PlanId | null>(null)
  const [error, setError] = useState('')

  async function subscribe(plan: PlanId) {
    setPending(plan)
    setError('')
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      setError(data.error || 'Could not start checkout.')
    } catch {
      setError('Could not start checkout.')
    }
    setPending(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map(plan => (
          <button
            key={plan.id}
            onClick={() => subscribe(plan.id)}
            disabled={pending !== null}
            className={`rounded-[var(--radius-card)] border px-4 py-3 text-left text-[13px] transition-colors duration-[var(--dur-micro)] disabled:opacity-60 ${
              plan.featured ? 'border-pu bg-pu-tint' : 'border-line bg-white hover:border-pu'
            }`}
          >
            <span className="block font-semibold">{plan.name}</span>
            <span className="text-zinc-500">
              {pending === plan.id ? 'Opening checkout…' : `$${plan.monthlyPriceUsd} per month`}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  )
}

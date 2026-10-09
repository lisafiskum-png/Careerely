import { describe, expect, it } from 'vitest'
import { subscriptionConfirmationMessage } from '../../lib/subscription-confirmation'

describe('subscription confirmation email', () => {
  it('confirms the created account, paid plan and next billing date', () => {
    const message = subscriptionConfirmationMessage({
      firstName: 'John',
      plan: 'pro',
      currentPeriodEnd: '2026-11-09T00:00:00.000Z',
    })

    expect(message.subject).toBe('Welcome to Careerely — your Pro plan is active')
    expect(message.text).toContain('Careerely account has been created')
    expect(message.text).toContain('Pro subscription is active at $49/month')
    expect(message.text).toContain('9 November 2026')
    expect(message.html).toContain('manage or cancel your subscription')
  })

  it('escapes customer names in the HTML message', () => {
    const message = subscriptionConfirmationMessage({ firstName: '<John & Co>', plan: 'basic', currentPeriodEnd: null })
    expect(message.html).toContain('&lt;John &amp; Co&gt;')
    expect(message.html).not.toContain('Hi <John & Co>')
  })
})

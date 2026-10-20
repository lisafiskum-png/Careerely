import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send }
  },
}))

import { sendSubscriptionConfirmation, subscriptionConfirmationMessage } from '../../lib/subscription-confirmation'

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'resend-test-key')
  vi.clearAllMocks()
  mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null })
})

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

  it('uses the Stripe event as the idempotency key for safe webhook retries', async () => {
    const profileRead = {
      select: () => profileRead,
      eq: () => profileRead,
      single: async () => ({ data: { first_name: 'John', subscription_confirmation_sent_at: null }, error: null }),
    }
    const profileUpdate = {
      update: () => profileUpdate,
      eq: () => profileUpdate,
      is: async () => ({ error: null }),
    }
    let profileCall = 0
    const admin = {
      from: () => profileCall++ === 0 ? profileRead : profileUpdate,
      auth: { admin: { getUserById: async () => ({ data: { user: { email: 'john@example.com' } }, error: null }) } },
    }

    await sendSubscriptionConfirmation(
      admin as never,
      'user-1',
      'pro',
      '2026-11-09T00:00:00.000Z',
      'evt_checkout_123',
    )

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'john@example.com' }),
      { idempotencyKey: 'subscription-confirmation/evt_checkout_123' },
    )
  })
})

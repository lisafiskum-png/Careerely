import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createUser: vi.fn(), rpc: vi.fn() }))

vi.mock('../../lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { createUser: mocks.createUser } }, rpc: mocks.rpc }),
}))

import { POST } from '../../app/api/signup/route'

function request(body: unknown) {
  return new Request('https://careerely.test/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key')
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
})

describe('deferred signup confirmation', () => {
  it('creates a confirmed in-progress account without invoking the email signup flow', async () => {
    const response = await POST(request({
      name: 'John Berg',
      email: 'John+HR@Example.com',
      password: 'good-password',
      selectedPlan: 'pro',
      agreed: true,
    }))

    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledWith('claim_signup_attempt', expect.objectContaining({ p_limit: 10 }))
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'john+hr@example.com',
      password: 'good-password',
      email_confirm: true,
      user_metadata: {
        first_name: 'John',
        last_name: 'Berg',
        terms_accepted: 'true',
        selected_plan: 'pro',
      },
    })
  })

  it('rejects incomplete input before touching Supabase', async () => {
    const response = await POST(request({ name: '', email: 'not-an-email', password: 'short', agreed: false }))
    expect(response.status).toBe(400)
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('sends existing users to login instead of starting another onboarding', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: new Error('User already registered') })
    const response = await POST(request({
      name: 'John Berg',
      email: 'john@example.com',
      password: 'good-password',
      agreed: true,
    }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('log in')
  })

  it('rejects cross-site and rate-limited account creation', async () => {
    const crossSite = request({ name: 'John Berg', email: 'john@example.com', password: 'good-password', agreed: true })
    crossSite.headers.set('origin', 'https://evil.example')
    expect((await POST(crossSite)).status).toBe(403)

    mocks.rpc.mockResolvedValueOnce({ data: false, error: null })
    const limited = await POST(request({ name: 'John Berg', email: 'john@example.com', password: 'good-password', agreed: true }))
    expect(limited.status).toBe(429)
    expect(mocks.createUser).not.toHaveBeenCalled()
  })
})

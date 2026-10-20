import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), send: vi.fn() }))

vi.mock('../../lib/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/auth')>()
  return { ...actual, requireUser: mocks.requireUser }
})
vi.mock('../../lib/password-change-notification', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/password-change-notification')>()
  return { ...actual, sendPasswordChangeNotification: mocks.send }
})

import { passwordChangeMessage } from '../../lib/password-change-notification'
import { POST } from '../../app/api/auth/password-changed/route'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://careerely.test')
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'user-1', email: 'john@example.com' })
  mocks.send.mockResolvedValue(undefined)
})

describe('password change notification', () => {
  it('explains what happened and how to secure the account', () => {
    const message = passwordChangeMessage()
    expect(message.subject).toBe('Your Careerely password has been changed')
    expect(message.text).toContain('changed successfully')
    expect(message.text).toContain('https://careerely.test/forgot-password')
    expect(message.html).toContain('hello@careerely.ai')
  })

  it('emails only the address from the verified session', async () => {
    const response = await POST(new Request('https://careerely.test/api/auth/password-changed', { method: 'POST' }))
    expect(response.status).toBe(200)
    expect(mocks.send).toHaveBeenCalledWith('john@example.com')
  })

  it('rejects cross-site requests before sending', async () => {
    const response = await POST(new Request('https://careerely.test/api/auth/password-changed', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    }))
    expect(response.status).toBe(403)
    expect(mocks.send).not.toHaveBeenCalled()
  })
})

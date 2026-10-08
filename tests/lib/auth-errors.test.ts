import { describe, expect, it } from 'vitest'
import { AUTH_UNAVAILABLE, authErrorMessage } from '../../lib/auth-errors'

describe('authentication error messages', () => {
  const invalid = 'That email and password don’t match an account.'
  it.each([new TypeError('Failed to fetch'), { status: 503 }, { status: 500 }, { name: 'AuthRetryableFetchError', status: 0 }, null])(
    'reports connection failures without blaming credentials: %s', error => {
      expect(authErrorMessage(error, invalid)).toBe(AUTH_UNAVAILABLE)
    },
  )
  it.each([{ status: 429 }, { code: 'over_request_rate_limit' }, { code: 'over_email_send_rate_limit', status: 400 }])(
    'asks rate-limited users to wait: %s', error => {
      expect(authErrorMessage(error, invalid)).toBe('Too many requests. Please wait a minute and try again.')
    },
  )
  it('distinguishes an unconfirmed email from invalid credentials', () => {
    expect(authErrorMessage({ status: 400, code: 'email_not_confirmed' }, invalid)).toContain('confirm your email')
    expect(authErrorMessage({ status: 400, code: 'invalid_credentials' }, invalid)).toBe(invalid)
  })
})

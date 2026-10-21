import { describe, expect, it } from 'vitest'
import { GET } from '../../app/.well-known/security.txt/route'

describe('security.txt', () => {
  it('publishes a stable vulnerability contact without exposing secrets', async () => {
    const response = GET()
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(body).toContain('Contact: mailto:hello@careerely.ai')
    expect(body).toContain('Canonical: https://www.careerely.ai/.well-known/security.txt')
    expect(body).not.toMatch(/(?:sk_live|service_role|whsec_)/)
  })
})

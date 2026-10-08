import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ responses: [] as { count: number; error: unknown }[] }))
vi.mock('../../lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: () => {
    const result = mocks.responses.shift()
    const query = { select: () => query, eq: () => query, lte: () => query, lt: () => query,
      then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve) }
    return query
  },
}) }))
import { GET } from '../../app/api/health/route'

beforeEach(() => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'a'.repeat(40))
  mocks.responses = [1, 0, 0, 0].map(count => ({ count, error: null }))
})

describe('production health', () => {
  it('identifies the exact healthy deployment without caching', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ status: 'ok', queue: 'ok', deployment_sha: 'a'.repeat(40) })
  })
  it.each([1, 2, 3])('reports a backlog, stale search or expired lease as degraded: %s', async index => {
    mocks.responses[index].count = index === 1 ? 21 : 1
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ database: 'ok', queue: 'backlogged' })
  })
  it('does not publish database errors or arbitrary environment values', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'not-a-commit')
    mocks.responses[0].error = { message: 'private connection details' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const response = await GET()
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ status: 'degraded', database: 'unavailable', deployment_sha: null })
    } finally { log.mockRestore() }
  })
})

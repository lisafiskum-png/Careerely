import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureMarketCycle: vi.fn(),
  runWorker: vi.fn(),
}))

vi.mock('../../lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('../../lib/engine/queue', () => ({
  ensureMarketCycle: mocks.ensureMarketCycle,
  runWorker: mocks.runWorker,
  errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}))

import { GET } from '../../app/api/engine/tick/route'

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  mocks.ensureMarketCycle.mockReset().mockResolvedValue(undefined)
  mocks.runWorker.mockReset().mockResolvedValue({ processed: 0 })
})

describe('engine tick route', () => {
  it('rejects callers without the cron secret', async () => {
    const response = await GET(new Request('https://careerely.test/api/engine/tick'))
    expect(response.status).toBe(401)
    expect(mocks.ensureMarketCycle).not.toHaveBeenCalled()
  })

  it('returns the worker result after a successful tick', async () => {
    const request = new Request('https://careerely.test/api/engine/tick', {
      headers: { authorization: 'Bearer test-cron-secret' },
    })
    const response = await GET(request)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ processed: 0 })
  })

  it('reports temporary failures as retryable without leaking internals', async () => {
    mocks.ensureMarketCycle.mockRejectedValue(new Error('private database details'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const request = new Request('https://careerely.test/api/engine/tick', {
        headers: { authorization: 'Bearer test-cron-secret' },
      })
      const response = await GET(request)
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({
        error: 'Engine tick unavailable',
        code: 'engine_unavailable',
      })
    } finally {
      log.mockRestore()
    }
  })
})

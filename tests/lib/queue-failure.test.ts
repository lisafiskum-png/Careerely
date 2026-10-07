import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIRequestError } from '../../lib/ai'

vi.mock('../../lib/engine/prepare', () => ({
  decidePreparation: vi.fn(), failPackage: vi.fn(), generatePackage: vi.fn(),
}))
vi.mock('../../lib/engine/scan', () => ({
  evaluateBatch: vi.fn(), finalizeRun: vi.fn(), startScan: vi.fn(),
}))

import { decidePreparation, failPackage, generatePackage } from '../../lib/engine/prepare'
import { finalizeRun } from '../../lib/engine/scan'
import {
  AI_FAILURE_COOLDOWN_MS,
  errorMessage,
  handleFailure,
  SOURCE_REFRESH_CYCLES,
  sourceSchedule,
  runTask,
  type Task,
} from '../../lib/engine/queue'
import { COMPANY_BOARDS } from '../../lib/engine/companies'
import { JOB_WRITE_BATCH_SIZE } from '../../lib/engine/ingest'

const task: Task = {
  id: 'task', kind: 'prepare_package', dedupe_key: 'prepare:opp:pkg',
  user_id: 'user', search_id: null, opportunity_id: 'opp',
  payload: { package_id: 'pkg' }, attempts: 1, max_attempts: 3,
}

type Write = { table: string; values: Record<string, unknown> }
function database(options: { blockedUntil?: string; enqueueError?: Error; queryError?: Error } = {}) {
  const writes: Write[] = []
  const admin = {
    from(table: string) {
      let result: Record<string, unknown> = { data: [], count: 0, error: options.queryError ?? null }
      const query = {
        select: () => query, eq: () => query, in: () => query, like: () => query,
        gt: () => query, order: () => query,
        limit: () => { result = { data: options.blockedUntil ? [{ run_after: options.blockedUntil }] : [], error: options.queryError ?? null }; return query },
        update(values: Record<string, unknown>) { writes.push({ table, values }); result = { error: null }; return query },
        upsert(values: Record<string, unknown>) {
          if (table === 'source_health') writes.push({ table, values })
          result = { error: options.enqueueError ?? null }
          return query
        },
        then(resolve: (value: Record<string, unknown>) => unknown) { return Promise.resolve(result).then(resolve) },
      }
      return query
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  } as unknown as SupabaseClient
  return { admin, writes }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(failPackage).mockResolvedValue(undefined)
  vi.mocked(finalizeRun).mockResolvedValue({ userId: 'user', shortlisted: [] })
})

describe('AI failure classification', () => {
  it.each([400, 401, 403, 404, 422])('does not retry HTTP %i or persist its response body', status => {
    const error = new AIRequestError(new Anthropic.APIError(status, { private: 'resume or credentials' }, 'private response', undefined))
    expect(error.retriable).toBe(false)
    expect(error.message).toBe(`AI unavailable (${status}).`)
    expect(error.message).not.toContain('private')
  })
  it.each([408, 409, 429, 500, 529, undefined])('retries transient status %s', status => {
    expect(new AIRequestError(new Anthropic.APIError(status, undefined, 'error', undefined)).retriable).toBe(true)
  })
})

describe('queue recovery', () => {
  it('uses small writes for source payloads with large descriptions', () => {
    expect(JOB_WRITE_BATCH_SIZE).toBeLessThanOrEqual(50)
  })
  it('spreads every source exactly once across a refresh window', () => {
    const scheduled = Array.from({ length: SOURCE_REFRESH_CYCLES }, (_, cycle) => sourceSchedule(String(cycle)).boards).flat()
    expect(scheduled).toHaveLength(COMPANY_BOARDS.length)
    expect(new Set(scheduled.map(board => `${board.provider}:${board.slug}`)).size).toBe(COMPANY_BOARDS.length)
    expect(Math.max(...Array.from({ length: SOURCE_REFRESH_CYCLES }, (_, cycle) => sourceSchedule(String(cycle)).boards.length))).toBeLessThanOrEqual(2)
  })

  it('uses one dedupe window across its staggered source cycles', () => {
    expect(sourceSchedule('0').tag).toBe('window:0')
    expect(sourceSchedule(String(SOURCE_REFRESH_CYCLES - 1)).tag).toBe('window:0')
    expect(sourceSchedule(String(SOURCE_REFRESH_CYCLES)).tag).toBe('window:1')
  })

  it('serializes plain client errors instead of storing object Object', () => {
    expect(errorMessage({ message: 'database failed', code: 'PGRST500' })).toBe('database failed | PGRST500')
    expect(errorMessage({ reason: 'network' })).toBe('{"reason":"network"}')
    expect(errorMessage({})).toBe('Unknown engine error')
  })

  it('releases a permanent failure immediately and opens a cross-worker cooldown', async () => {
    const { admin, writes } = database()
    const before = Date.now()
    await handleFailure(admin, task, new AIRequestError(new Anthropic.APIError(400, undefined, 'credit balance', undefined)))
    expect(failPackage).toHaveBeenCalledWith(admin, 'opp', 'AI unavailable (400).', 'pkg')
    expect(writes[0].values).toMatchObject({ status: 'failed', last_error: 'AI unavailable (400).', locked_until: null })
    expect(new Date(writes[0].values.run_after as string).getTime()).toBeGreaterThanOrEqual(before + AI_FAILURE_COOLDOWN_MS)
  })

  it('keeps transient failures queued without releasing the reservation', async () => {
    const { admin, writes } = database()
    await handleFailure(admin, task, new AIRequestError(new Anthropic.APIError(429, undefined, 'rate limited', undefined)))
    expect(failPackage).not.toHaveBeenCalled()
    expect(writes[0].values.status).toBe('queued')
  })

  it('leaves the task leased if final-attempt quota cleanup fails', async () => {
    const { admin, writes } = database()
    vi.mocked(failPackage).mockRejectedValueOnce(new Error('database offline'))
    await expect(handleFailure(admin, { ...task, attempts: 3 }, new Error('generation failed'))).rejects.toThrow('database offline')
    expect(writes).toEqual([])
  })

  it('defers existing packages during cooldown without spending a queue attempt', async () => {
    const blockedUntil = new Date(Date.now() + AI_FAILURE_COOLDOWN_MS).toISOString()
    const { admin, writes } = database({ blockedUntil })
    await runTask(admin, task)
    expect(generatePackage).not.toHaveBeenCalled()
    expect(writes[0].values).toMatchObject({ status: 'queued', run_after: blockedUntil, attempts: 0 })
  })

  it('does not reserve more quota while preparation is blocked', async () => {
    const { admin, writes } = database({ blockedUntil: new Date(Date.now() + AI_FAILURE_COOLDOWN_MS).toISOString() })
    await runTask(admin, { ...task, kind: 'decide_preparation', opportunity_id: null, payload: {} })
    expect(decidePreparation).not.toHaveBeenCalled()
    expect(writes[0].values.status).toBe('done')
  })

  it('does not hide database errors as an empty queue or a finished decision', async () => {
    const { admin, writes } = database({ queryError: new Error('database offline') })
    await expect(runTask(admin, { ...task, kind: 'decide_preparation', payload: {} })).rejects.toThrow('database offline')
    expect(writes).toEqual([])
  })

  it('leaves scan completion retryable until its preparation decision is durably queued', async () => {
    const { admin, writes } = database({ enqueueError: new Error('enqueue failed') })
    await expect(runTask(admin, { ...task, kind: 'scan_search', payload: { phase: 'finalize', run_id: 'run' } })).rejects.toThrow('enqueue failed')
    expect(writes).toEqual([])
  })

  it('pauses a repeatedly failing source after its final attempt', async () => {
    const { admin, writes } = database()
    const sourceTask: Task = {
      ...task,
      kind: 'sync_source',
      opportunity_id: null,
      attempts: 3,
      payload: { provider: 'lever', slug: 'example', company: 'Example' },
    }
    await handleFailure(admin, sourceTask, new Error('upstream request timeout'))
    expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'source_health',
        values: expect.objectContaining({ state: 'degraded', provider: 'lever', slug: 'example' }),
      }),
      expect.objectContaining({ table: 'engine_tasks', values: expect.objectContaining({ status: 'failed' }) }),
    ]))
  })
})

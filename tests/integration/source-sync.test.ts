import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Board sync failures (Phase D8) against the local Supabase stack: a missing
// board is recorded and not retried (nor queued again until rechecked or
// reconfigured), temporary failures are retried with backoff, malformed or
// rejected responses fail once without touching existing jobs, and every
// failure leaves a diagnostic last_error. Job-board HTTP is faked; Supabase
// calls go through. Skipped when the local stack isn't running.

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const reachable = await fetch(`${SUPABASE_URL}/auth/v1/health`).then(r => r.ok).catch(() => false)
const { boardsToSync, handleFailure, runTask, MISSING_BOARD_RECHECK_DAYS } = await import('../../lib/engine/queue')
const { COMPANY_BOARDS } = await import('../../lib/engine/companies')
type Task = Parameters<typeof runTask>[1]

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const tag = `src-test-${Date.now()}`
const realFetch = globalThis.fetch
const ashbyFixture = readFileSync(path.resolve(import.meta.dirname, '../fixtures/ats/ashby.json'), 'utf8')
/** Board responses by slug: [status, body]. Everything else (Supabase) uses the real fetch. */
let boards: Record<string, [number, string]> = {}

// A configured board, so the registry filter applies to it.
const missing = COMPANY_BOARDS.find(b => b.provider === 'ashby')!

async function insertTask(board: { provider: string; slug: string; company: string }): Promise<Task> {
  const { data, error } = await admin
    .from('engine_tasks')
    .insert({ kind: 'sync_source', dedupe_key: `sync:${board.provider}:${board.slug}:${tag}`, payload: board, status: 'running', attempts: 1, locked_until: new Date(Date.now() + 600_000).toISOString() })
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}
const taskRow = async (id: string) => (await admin.from('engine_tasks').select('status, attempts, last_error, run_after').eq('id', id).single()).data!
const health = async (slug: string) => (await admin.from('source_health').select('provider, slug, state, http_status, recheck_after').eq('slug', slug).maybeSingle()).data

describe.skipIf(!reachable)('board sync failures (D8)', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      const m = url.match(/^https:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/([^?]+)/)
      if (!m) return realFetch(input, init)
      const [status, body] = boards[m[1]] ?? [404, 'not found']
      return new Response(body, { status })
    })
  })
  afterEach(() => {
    boards = {}
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    await admin.from('engine_tasks').delete().like('dedupe_key', `%:${tag}`)
    await admin.from('source_health').delete().like('slug', `${tag}%`)
    await admin.from('source_health').delete().eq('provider', missing.provider).eq('slug', missing.slug)
    await admin.from('jobs').delete().like('company_slug', `${tag}%`)
  })

  it('a successful board syncs its jobs and clears any "missing" record', async () => {
    const board = { provider: 'ashby', slug: `${tag}-ok`, company: 'Acme' }
    await admin.from('source_health').insert({ provider: 'ashby', slug: board.slug, http_status: 404, recheck_after: new Date(Date.now() - 1000).toISOString() })
    boards[board.slug] = [200, ashbyFixture]
    const task = await insertTask(board)
    await runTask(admin, task)
    expect(await taskRow(task.id)).toMatchObject({ status: 'done', last_error: null })
    expect(await health(board.slug)).toBeNull()
    const { count } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('company_slug', board.slug).eq('is_active', true)
    expect(count).toBe(2)
  })

  it('a missing board fails once, is recorded, and is not queued again until rechecked or reconfigured', async () => {
    boards[missing.slug] = [404, '<html>not here</html>']
    const task = await insertTask(missing)
    await runTask(admin, task)
    expect(await taskRow(task.id)).toMatchObject({ status: 'failed', attempts: 1, last_error: `ashby/${missing.slug}: HTTP 404 (not_found)` })
    const record = await health(missing.slug)
    expect(record).toMatchObject({ provider: 'ashby', state: 'not_found', http_status: 404 })
    const days = (new Date(record!.recheck_after).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(MISSING_BOARD_RECHECK_DAYS - 0.1)

    // Tomorrow's nightly run skips it; the other configured boards are still synced.
    const tomorrow = await boardsToSync(admin, new Date(Date.now() + 86_400_000))
    expect(tomorrow.some(b => b.provider === missing.provider && b.slug === missing.slug)).toBe(false)
    expect(tomorrow).toHaveLength(COMPANY_BOARDS.length - (await admin.from('source_health').select('slug', { count: 'exact', head: true }).gt('recheck_after', new Date(Date.now() + 86_400_000).toISOString())).count!)
    // Once the recheck is due it is queued again (a single attempt).
    const later = await boardsToSync(admin, new Date(Date.now() + (MISSING_BOARD_RECHECK_DAYS + 1) * 86_400_000))
    expect(later.some(b => b.slug === missing.slug)).toBe(true)
  })

  it('a temporary provider failure is retried with backoff and a diagnostic error', async () => {
    const board = { provider: 'ashby', slug: `${tag}-busy`, company: 'Busy' }
    boards[board.slug] = [503, 'Service Unavailable']
    const task = await insertTask(board)
    const err = await runTask(admin, task).then(() => null, e => e)
    expect(err).toMatchObject({ kind: 'provider_error', retriable: true })
    await handleFailure(admin, task, err)
    const row = await taskRow(task.id)
    expect(row).toMatchObject({ status: 'queued', attempts: 1, last_error: `ashby/${board.slug}: HTTP 503 (provider_error)` })
    expect(new Date(row.run_after).getTime()).toBeGreaterThan(Date.now())
    expect(await health(board.slug)).toBeNull()

    // After the last attempt it fails, still not recorded as missing.
    await handleFailure(admin, { ...task, attempts: task.max_attempts }, err)
    expect(await taskRow(task.id)).toMatchObject({ status: 'failed' })
    expect(await health(board.slug)).toBeNull()
  })

  it('a malformed response fails once and never expires the board’s existing jobs', async () => {
    const board = { provider: 'ashby', slug: `${tag}-odd`, company: 'Odd' }
    boards[board.slug] = [200, ashbyFixture]
    const ok = await insertTask(board)
    await runTask(admin, ok)
    boards[board.slug] = [200, JSON.stringify({ success: false, errors: ['maintenance'] })]
    await admin.from('engine_tasks').update({ dedupe_key: `sync:ashby:${board.slug}:prev-${tag}` }).eq('id', ok.id)
    const task = await insertTask(board)
    await runTask(admin, task)
    expect(await taskRow(task.id)).toMatchObject({ status: 'failed', attempts: 1, last_error: `ashby/${board.slug}: HTTP 200 (malformed)` })
    expect(await health(board.slug)).toBeNull()
    const { count } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('company_slug', board.slug).eq('is_active', true)
    expect(count).toBe(2)
  })

  it('a rejected request (e.g. 403) fails once for today and is not recorded as missing', async () => {
    const board = { provider: 'ashby', slug: `${tag}-denied`, company: 'Denied' }
    boards[board.slug] = [403, 'Forbidden']
    const task = await insertTask(board)
    await runTask(admin, task)
    expect(await taskRow(task.id)).toMatchObject({ status: 'failed', attempts: 1, last_error: `ashby/${board.slug}: HTTP 403 (rejected)` })
    expect(await health(board.slug)).toBeNull()
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// /api/health queue semantics against the local Supabase stack: many due
// tasks are normal (one scan per active search every cycle); due work that
// has waited too long is a backlog. Skipped when the local stack isn't running.

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const reachable = await fetch(`${SUPABASE_URL}/auth/v1/health`).then(r => r.ok).catch(() => false)
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
const { GET } = await import('../../app/api/health/route')

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const tag = `health-test-${Date.now()}`

async function queueTasks(n: number, waitedMinutes: number) {
  const run_after = new Date(Date.now() - waitedMinutes * 60_000).toISOString()
  const rows = Array.from({ length: n }, (_, i) => ({ kind: 'sync_source', dedupe_key: `${tag}:${waitedMinutes}:${i}`, payload: {}, status: 'queued', run_after }))
  const { error } = await admin.from('engine_tasks').insert(rows)
  if (error) throw error
}

describe.skipIf(!reachable)('/api/health queue status', () => {
  afterEach(async () => {
    await admin.from('engine_tasks').delete().like('dedupe_key', `${tag}:%`)
  })

  it('many freshly due tasks are not a backlog', async () => {
    await queueTasks(40, 1)
    const body = await (await GET()).json()
    expect(body.claimable_tasks).toBeGreaterThanOrEqual(40)
    expect(body.oldest_task_wait_minutes).toBeLessThanOrEqual(15)
  })

  it('due work waiting longer than 15 minutes is reported as backlogged', async () => {
    await queueTasks(1, 30)
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body).toMatchObject({ status: 'degraded', database: 'ok', queue: 'backlogged' })
    expect(body.oldest_task_wait_minutes).toBeGreaterThanOrEqual(30)
  })
})

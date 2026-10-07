import { afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Immediate-scan cap for Search actions (Phase D8) against the local Supabase
// stack: the allowance per UTC day (Basic 1, Pro 5, Max 10) is shared by
// creating and resuming searches, can't be bypassed by pausing and resuming
// other searches, never blocks onboarding's first scan, and leaves nightly
// scans untouched. Skipped when the local stack isn't running.

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const reachable = await fetch(`${SUPABASE_URL}/auth/v1/health`).then(r => r.ok).catch(() => false)
const { enqueueFirstScan, marketCycleKey, runTask, sourceSchedule, startSearchScan } = await import('../../lib/engine/queue')

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const users: string[] = []
const FAR_DAY = '2099-01-01'

async function userOnPlan(plan: 'basic' | 'pro' | 'max'): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: `cap-${plan}+${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, password: 'password-123', email_confirm: true })
  if (error) throw error
  users.push(data.user.id)
  const { error: subError } = await admin.from('subscriptions').upsert({
    user_id: data.user.id,
    plan,
    status: 'active',
    current_period_start: new Date(Date.now() - 86_400_000).toISOString(),
    current_period_end: new Date(Date.now() + 20 * 86_400_000).toISOString(),
  })
  if (subError) throw subError
  return data.user.id
}

async function search(userId: string, name: string, status: 'active' | 'paused' = 'active'): Promise<string> {
  const { data, error } = await admin.from('searches').insert({ user_id: userId, name, status, target_roles: ['Sales Manager'], work_styles: ['remote'] }).select('id').single()
  if (error) throw error
  return data.id
}
const setStatus = (id: string, status: 'active' | 'paused') => admin.from('searches').update({ status }).eq('id', id)
const scanTasks = async (searchId: string) => (await admin.from('engine_tasks').select('dedupe_key, payload').eq('kind', 'scan_search').eq('search_id', searchId)).data ?? []
const searchStatus = async (id: string) => (await admin.from('searches').select('status').eq('id', id).single()).data!.status

describe.skipIf(!reachable)('immediate scan cap for Search actions (D8)', () => {
  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id)
  })

  it('Basic: one immediate scan a day; create and resume share it; the delayed search stays active', async () => {
    const uid = await userOnPlan('basic')
    const first = await search(uid, 'First')
    expect(await startSearchScan(admin, uid, first, 'create')).toBe(true)
    expect((await scanTasks(first)).map(t => t.dedupe_key)).toEqual([`scan:${first}:first`])

    // Resume of a different search uses the same (now spent) allowance.
    await setStatus(first, 'paused')
    const other = await search(uid, 'Other', 'paused')
    await setStatus(other, 'active')
    expect(await startSearchScan(admin, uid, other, 'resume')).toBe(false)
    expect(await scanTasks(other)).toEqual([])
    expect(await searchStatus(other)).toBe('active')
  })

  it('Pro: five, then the sixth waits — pausing and resuming other searches cannot bypass it', async () => {
    const uid = await userOnPlan('pro')
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      ids.push(await search(uid, `Created ${i}`))
      expect(await startSearchScan(admin, uid, ids[i], 'create'), `create ${i}`).toBe(true)
    }
    // Two resumes of other searches: allowance 4 and 5.
    for (let i = 0; i < 2; i++) {
      const id = await search(uid, `Resumed ${i}`, 'paused')
      await setStatus(id, 'active')
      expect(await startSearchScan(admin, uid, id, 'resume'), `resume ${i}`).toBe(true)
      ids.push(id)
    }
    // Pause one and resume another: no sixth immediate scan, by create or resume.
    await setStatus(ids[0], 'paused')
    const sixth = await search(uid, 'Sixth', 'paused')
    await setStatus(sixth, 'active')
    expect(await startSearchScan(admin, uid, sixth, 'resume')).toBe(false)
    await setStatus(ids[1], 'paused')
    const created = await search(uid, 'Created later')
    expect(await startSearchScan(admin, uid, created, 'create')).toBe(false)
    expect(await scanTasks(sixth)).toEqual([])
    expect(await scanTasks(created)).toEqual([])
    expect(await searchStatus(sixth)).toBe('active')
    expect(await searchStatus(created)).toBe('active')

    // Resuming a search whose scan for today is already queued uses no allowance and says it is scanning.
    await setStatus(ids[3], 'paused')
    await setStatus(ids[3], 'active')
    expect(await startSearchScan(admin, uid, ids[3], 'resume')).toBe(true)
    expect((await scanTasks(ids[3])).filter(t => (t.payload as { trigger?: string }).trigger === 'resume')).toHaveLength(1)
  })

  it('Max: ten, then the eleventh waits', async () => {
    const uid = await userOnPlan('max')
    const results: boolean[] = []
    for (let i = 0; i < 11; i++) results.push(await startSearchScan(admin, uid, await search(uid, `Max ${i}`), 'create'))
    expect(results).toEqual([...Array(10).fill(true), false])
  })

  it('parallel requests cannot exceed the allowance', async () => {
    const uid = await userOnPlan('pro')
    // Paused rows: this only exercises concurrent claims (Pro allows 5 active searches).
    const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => search(uid, `Parallel ${i}`, 'paused')))
    const results = await Promise.all(ids.map(id => startSearchScan(admin, uid, id, 'create')))
    expect(results.filter(Boolean)).toHaveLength(5)
  })

  it('onboarding’s first scan is never blocked, and the continuous market cycle still includes the delayed search', async () => {
    const uid = await userOnPlan('basic')
    const used = await search(uid, 'Uses the allowance')
    expect(await startSearchScan(admin, uid, used, 'create')).toBe(true)
    await setStatus(used, 'paused')

    // Onboarding queues its first scan directly, whatever the allowance.
    const profileSearch = await search(uid, 'From preferences')
    await enqueueFirstScan(admin, uid, profileSearch)
    expect((await scanTasks(profileSearch)).map(t => t.dedupe_key)).toEqual([`scan:${profileSearch}:first`])

    // A delayed active search (allowance spent) is scanned by the next market cycle.
    await setStatus(profileSearch, 'paused')
    const delayed = await search(uid, 'Delayed')
    expect(await startSearchScan(admin, uid, delayed, 'create')).toBe(false)
    // Run a market cycle for a far-future slot; its board syncs are held back
    // (run_after in 2099) so no worker elsewhere picks them up, then removed.
    const holdSyncs = new Proxy(admin, {
      get(target, prop, receiver) {
        if (prop !== 'from') return Reflect.get(target, prop, receiver)
        return (table: string) => {
          const builder = target.from(table)
          if (table !== 'engine_tasks') return builder
          return new Proxy(builder, {
            get(b, p) {
              if (p === 'upsert') {
                return (row: Record<string, unknown>, opts: object) =>
                  b.upsert((row.kind === 'sync_source' ? { ...row, run_after: `${FAR_DAY}T00:00:00Z` } : row) as never, opts as never)
              }
              const v = Reflect.get(b, p)
              return typeof v === 'function' ? v.bind(b) : v
            },
          })
        }
      },
    }) as SupabaseClient
    const cycle = marketCycleKey(new Date(`${FAR_DAY}T02:00:00Z`))
    try {
      await runTask(holdSyncs, { id: '00000000-0000-0000-0000-000000000000', kind: 'market_cycle', dedupe_key: null, user_id: null, search_id: null, opportunity_id: null, payload: { cycle }, attempts: 1, max_attempts: 3 } as never)
      expect((await scanTasks(delayed)).map(t => t.dedupe_key)).toEqual([`scan:${delayed}:cycle:${cycle}`])
      expect(await scanTasks(used)).toHaveLength(1) // paused: not scanned by the cycle
    } finally {
      await admin.from('engine_tasks').delete().like('dedupe_key', `%:cycle:${cycle}`)
      await admin.from('engine_tasks').delete().like('dedupe_key', `sync:%:${sourceSchedule(cycle).tag}`)
    }
  })
})

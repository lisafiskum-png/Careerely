import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COMPANY_BOARDS, type CompanyBoard } from './companies'
import { syncBoard } from './ingest'
import { SourceError } from './sources'
import { decidePreparation, failPackage, generatePackage } from './prepare'
import { evaluateBatch, finalizeRun, startScan } from './scan'

// Work queue for the Opportunity Engine (public.engine_tasks).
//
// Supabase Cron calls the worker frequently. A small idempotent market cycle is
// created every few minutes; it refreshes job boards and scans every active
// search without an artificial overnight window or post-sync delay.
//   market_cycle       → enqueues source syncs and active-search scans
//   sync_source        → one company board (Greenhouse / Lever / Ashby)
//   scan_search        → one search: start → evaluate (in batches) → finalize
//   decide_preparation → Stage 6 for one user after fresh scan results land
//   prepare_package    → Stage 7 for one opportunity/package reservation

export type TaskKind = 'market_cycle' | 'sync_source' | 'scan_search' | 'decide_preparation' | 'prepare_package'

export type Task = {
  id: string
  kind: TaskKind
  dedupe_key: string | null
  user_id: string | null
  search_id: string | null
  opportunity_id: string | null
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

/** Fresh-market cadence. Worker ticks can run more often than this. */
export const MARKET_CYCLE_MINUTES = 5
export const MARKET_CYCLE_MS = MARKET_CYCLE_MINUTES * 60_000

export const utcDate = (d: Date) => d.toISOString().slice(0, 10)
export const marketCycleKey = (d: Date) => String(Math.floor(d.getTime() / MARKET_CYCLE_MS))

export async function enqueue(
  admin: SupabaseClient,
  task: { kind: TaskKind; dedupe_key?: string; user_id?: string; search_id?: string; opportunity_id?: string; payload?: object; run_after?: Date },
): Promise<void> {
  const row = { ...task, run_after: (task.run_after ?? new Date()).toISOString(), payload: task.payload ?? {} }
  const { error } = task.dedupe_key
    ? await admin.from('engine_tasks').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    : await admin.from('engine_tasks').insert(row)
  if (error) throw error
}

/** Queue the current five-minute market cycle once. Called on every worker tick. */
export async function ensureMarketCycle(admin: SupabaseClient, now = new Date()): Promise<void> {
  const cycle = marketCycleKey(now)
  await enqueue(admin, { kind: 'market_cycle', dedupe_key: `market:${cycle}`, payload: { cycle } })
}

/** First scan right after onboarding (and after a search is created later). */
export async function enqueueFirstScan(admin: SupabaseClient, userId: string, searchId: string, now = new Date()): Promise<void> {
  const { count } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true)
  if (!count) {
    // Fresh deployment with no postings yet: queue board syncs first. Because
    // they are created before the scan, the FIFO worker naturally services the
    // syncs first without making the user wait a fixed ten minutes.
    await enqueueSyncs(admin, `bootstrap:${marketCycleKey(now)}`)
  }
  await enqueue(admin, {
    kind: 'scan_search',
    dedupe_key: `scan:${searchId}:first`,
    user_id: userId,
    search_id: searchId,
    payload: { phase: 'start', trigger: 'first' },
  })
}

/** Queue a scan immediately after a paused search is resumed. */
export async function enqueueResumeScan(admin: SupabaseClient, userId: string, searchId: string, now = new Date()): Promise<void> {
  const cycle = marketCycleKey(now)
  await enqueue(admin, {
    kind: 'scan_search',
    dedupe_key: `scan:${searchId}:resume:${cycle}`,
    user_id: userId,
    search_id: searchId,
    payload: { phase: 'start', trigger: 'resume', cycle },
  })
}

/**
 * Immediate scan for an explicit Search action. The existing plan-specific
 * daily allowance still protects the expensive manual create/resume path, but
 * an active search is never stranded until an overnight run: the continuous
 * market cycle will pick it up within minutes even when this returns false.
 */
export async function startSearchScan(admin: SupabaseClient, userId: string, searchId: string, action: 'create' | 'resume', now = new Date()): Promise<boolean> {
  const { data: existing } = await admin
    .from('engine_tasks')
    .select('status')
    .eq('kind', 'scan_search')
    .eq('search_id', searchId)
    .in('status', ['queued', 'running'])
    .limit(1)
  if (existing?.length) return true

  const { data: allowed, error } = await admin.rpc('claim_immediate_scan', { uid: userId })
  if (error) throw error
  if (!allowed) return false
  if (action === 'create') await enqueueFirstScan(admin, userId, searchId, now)
  else await enqueueResumeScan(admin, userId, searchId, now)
  return true
}

/** A missing board (404 / 410) is rechecked once a week. */
export const MISSING_BOARD_RECHECK_DAYS = 7

/** Configured boards to sync now: known missing boards are skipped until recheck. */
export async function boardsToSync(admin: SupabaseClient, now = new Date()) {
  const { data, error } = await admin.from('source_health').select('provider, slug').gt('recheck_after', now.toISOString())
  if (error) throw error
  const skip = new Set((data ?? []).map(r => `${r.provider}:${r.slug}`))
  return COMPANY_BOARDS.filter(b => !skip.has(`${b.provider}:${b.slug}`))
}

async function enqueueSyncs(admin: SupabaseClient, tag: string) {
  for (const board of await boardsToSync(admin)) {
    await enqueue(admin, { kind: 'sync_source', dedupe_key: `sync:${board.provider}:${board.slug}:${tag}`, payload: { ...board } })
  }
}

/** Queue one fresh-market pass. Source tasks are inserted before scan tasks. */
async function runMarketCycle(admin: SupabaseClient, task: Task) {
  const cycle = typeof task.payload.cycle === 'string' ? task.payload.cycle : marketCycleKey(new Date())
  await enqueueSyncs(admin, cycle)

  const { data: searches, error } = await admin.from('searches').select('id, user_id').eq('status', 'active')
  if (error) throw error
  for (const s of searches ?? []) {
    const { data: access } = await admin.rpc('has_active_access', { uid: s.user_id })
    if (!access) continue
    await enqueue(admin, {
      kind: 'scan_search',
      dedupe_key: `scan:${s.id}:cycle:${cycle}`,
      user_id: s.user_id,
      search_id: s.id,
      payload: { phase: 'start', trigger: 'continuous', cycle },
    })
  }
}

/**
 * One board sync. Success clears any missing-board record. A missing board
 * (404 / 410) is recorded and rechecked weekly; other non-retriable failures
 * fail this cycle; temporary failures use the normal queue backoff.
 */
async function runSyncTask(admin: SupabaseClient, task: Task, now = new Date()) {
  const board = task.payload as unknown as CompanyBoard
  try {
    await syncBoard(admin, board)
  } catch (err) {
    if (!(err instanceof SourceError) || err.retriable) throw err
    if (err.permanent) {
      const { error } = await admin.from('source_health').upsert({
        provider: board.provider,
        slug: board.slug,
        state: 'not_found',
        http_status: err.status,
        last_checked_at: now.toISOString(),
        recheck_after: new Date(now.getTime() + MISSING_BOARD_RECHECK_DAYS * 86_400_000).toISOString(),
      })
      if (error) throw error
    }
    console.error('board sync failed', err.message)
    const { error } = await admin.from('engine_tasks').update({ status: 'failed', last_error: err.message, locked_until: null }).eq('id', task.id)
    if (error) throw error
    return
  }
  const { error: healthError } = await admin.from('source_health').delete().eq('provider', board.provider).eq('slug', board.slug)
  if (healthError) throw healthError
  return complete(admin, task)
}

async function requeue(admin: SupabaseClient, task: Task, payload: object, delayMs = 0) {
  const { error } = await admin
    .from('engine_tasks')
    .update({ status: 'queued', attempts: 0, payload, run_after: new Date(Date.now() + delayMs).toISOString(), locked_until: null })
    .eq('id', task.id)
  if (error) throw error
}

async function complete(admin: SupabaseClient, task: Task) {
  const { error } = await admin.from('engine_tasks').update({ status: 'done', locked_until: null, last_error: null }).eq('id', task.id)
  if (error) throw error
}

async function runScanTask(admin: SupabaseClient, task: Task) {
  const phase = task.payload.phase as string
  if (phase === 'start') {
    const started = await startScan(admin, task.search_id!)
    if (!started) return complete(admin, task)
    return requeue(admin, task, { ...task.payload, phase: started.pending ? 'evaluate' : 'finalize', run_id: started.runId })
  }
  const runId = task.payload.run_id as string
  if (phase === 'evaluate') {
    const { remaining } = await evaluateBatch(admin, runId)
    return requeue(admin, task, { ...task.payload, phase: remaining ? 'evaluate' : 'finalize' })
  }
  const { userId } = await finalizeRun(admin, runId)
  await complete(admin, task)
  const cycle = typeof task.payload.cycle === 'string' ? task.payload.cycle : null
  const key = cycle ? `decide:${userId}:${cycle}` : `decide:${userId}:${runId}`
  await enqueue(admin, { kind: 'decide_preparation', dedupe_key: key, user_id: userId, payload: cycle ? { cycle } : {} })
}

function reservedIds(payload: Record<string, unknown>): string[] | null {
  const value = payload.reserved_opportunity_ids
  if (!Array.isArray(value)) return null
  return value.filter((id): id is string => typeof id === 'string')
}

async function runDecideTask(admin: SupabaseClient, task: Task) {
  // Only wait for scans that are actively executing right now. Future/queued
  // continuous scans must never hold application preparation for minutes.
  const { count } = await admin
    .from('engine_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'scan_search')
    .eq('user_id', task.user_id!)
    .eq('status', 'running')
  if (count) return requeue(admin, task, task.payload, 5_000)

  let reserved = reservedIds(task.payload)
  if (reserved === null) {
    const { data: access } = await admin.rpc('has_active_access', { uid: task.user_id })
    reserved = access ? await decidePreparation(admin, task.user_id!) : []
    if (!reserved.length) return complete(admin, task)

    // Persist the reservation list before queueing package work. If the worker
    // dies while queueing, its retry reuses exactly these reservations.
    return requeue(admin, task, { ...task.payload, reserved_opportunity_ids: reserved })
  }

  if (!reserved.length) return complete(admin, task)
  const { data: packages, error } = await admin
    .from('application_packages')
    .select('id, opportunity_id')
    .in('opportunity_id', reserved)
    .eq('status', 'preparing')
  if (error) throw error
  const byOpportunity = new Map((packages ?? []).map(p => [p.opportunity_id as string, p.id as string]))

  for (const id of reserved) {
    const packageId = byOpportunity.get(id)
    if (!packageId) continue
    await enqueue(admin, {
      kind: 'prepare_package',
      dedupe_key: `prepare:${id}:${packageId}`,
      user_id: task.user_id!,
      opportunity_id: id,
      payload: { package_id: packageId },
    })
  }
  return complete(admin, task)
}

export async function runTask(admin: SupabaseClient, task: Task, now = new Date()): Promise<void> {
  switch (task.kind) {
    case 'market_cycle':
      await runMarketCycle(admin, task)
      return complete(admin, task)
    case 'sync_source':
      return runSyncTask(admin, task, now)
    case 'scan_search':
      return runScanTask(admin, task)
    case 'decide_preparation':
      return runDecideTask(admin, task)
    case 'prepare_package': {
      const packageId = typeof task.payload.package_id === 'string' ? task.payload.package_id : undefined
      await generatePackage(admin, task.opportunity_id!, packageId)
      return complete(admin, task)
    }
  }
}

export async function handleFailure(admin: SupabaseClient, task: Task, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  console.error('engine task failed', task.kind, task.id, message)
  if (task.attempts >= task.max_attempts) {
    const { error } = await admin.from('engine_tasks').update({ status: 'failed', last_error: message.slice(0, 2000), locked_until: null }).eq('id', task.id)
    if (error) throw error
    if (task.kind === 'prepare_package' && task.opportunity_id) {
      const packageId = typeof task.payload.package_id === 'string' ? task.payload.package_id : undefined
      await failPackage(admin, task.opportunity_id, message, packageId)
    }
    if (task.kind === 'scan_search' && task.payload.run_id) {
      const { error: runError } = await admin
        .from('search_runs')
        .update({ status: 'failed', error: message.slice(0, 2000), finished_at: new Date().toISOString() })
        .eq('id', task.payload.run_id as string)
        .eq('status', 'running')
      if (runError) throw runError
    }
    return
  }
  // Retry quickly enough to feel live while still backing off transient faults.
  const { error } = await admin
    .from('engine_tasks')
    .update({ status: 'queued', last_error: message.slice(0, 2000), locked_until: null, run_after: new Date(Date.now() + task.attempts * 60_000).toISOString() })
    .eq('id', task.id)
  if (error) throw error
}

export type WorkerResult = { processed: number; failed: number }

/** Claims and runs tasks until the time budget is used up. */
export async function runWorker(admin: SupabaseClient, opts: { budgetMs: number; concurrency?: number; leaseSeconds?: number }): Promise<WorkerResult> {
  const deadline = Date.now() + opts.budgetMs
  const concurrency = opts.concurrency ?? 4
  let processed = 0
  let failed = 0
  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc('claim_engine_tasks', { p_limit: concurrency, p_lease_seconds: opts.leaseSeconds ?? 600 })
    if (error) throw error
    const tasks = (data ?? []) as Task[]
    if (!tasks.length) break
    await Promise.all(
      tasks.map(async task => {
        try {
          await runTask(admin, task)
          processed++
        } catch (err) {
          failed++
          await handleFailure(admin, task, err)
        }
      }),
    )
  }
  return { processed, failed }
}

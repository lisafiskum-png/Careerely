import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AIRequestError, AI_REQUEST_TIMEOUT_MS } from '../ai'
import { COMPANY_BOARDS, type CompanyBoard } from './companies'
import { discoverGlobalJobs, globalDiscoveryEnabled, globalDiscoverySlot } from './global-source'
import { syncBoard } from './ingest'
import { SourceError } from './sources'
import { decidePreparation, failPackage, generatePackage } from './prepare'
import { evaluateBatch, finalizeRun, startScan } from './scan'

// Work queue for the Opportunity Engine (public.engine_tasks).
//
// Supabase Cron calls the worker frequently. A small idempotent market cycle is
// created every few minutes. User-facing scan/application work is queued first;
// source refreshes follow shortly after so they can feed the next cycle without
// forcing a user to sit behind dozens of ATS requests.
//   market_cycle       → enqueues active-search scans and source refreshes
//   sync_source        → one direct company board (Greenhouse / Lever / Ashby)
//   discover_search    → optional global Google Jobs discovery for one Search
//   scan_search        → one search: start → evaluate (in batches) → finalize
//   decide_preparation → Stage 6 after fresh scan results land
//   prepare_package    → Stage 7 for one opportunity/package reservation

export type TaskKind = 'market_cycle' | 'sync_source' | 'discover_search' | 'scan_search' | 'decide_preparation' | 'prepare_package'

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

export const MARKET_CYCLE_MINUTES = 5
export const MARKET_CYCLE_MS = MARKET_CYCLE_MINUTES * 60_000
/** Refresh every direct ATS board once per six-hour window, evenly staggered. */
export const SOURCE_REFRESH_INTERVAL_MINUTES = 6 * 60
export const SOURCE_REFRESH_CYCLES = SOURCE_REFRESH_INTERVAL_MINUTES / MARKET_CYCLE_MINUTES
/** Leave the first minute of a cycle free for user-facing scan/prep work. */
export const SOURCE_REFRESH_DELAY_MS = 60_000
export const AI_FAILURE_COOLDOWN_MS = 30 * 60_000

/** Shared across workers/deployments; failed queue rows are the cooldown record. */
export async function preparationBlockedUntil(admin: SupabaseClient, now = new Date()): Promise<string | null> {
  const { data, error } = await admin.from('engine_tasks')
    .select('run_after')
    .eq('kind', 'prepare_package')
    .eq('status', 'failed')
    .like('last_error', 'AI unavailable (%)%')
    .gt('run_after', now.toISOString())
    .order('run_after', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0]?.run_after ?? null
}

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
  const { count, error } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true)
  if (error) throw error
  if (!count) {
    // Only a truly fresh deployment needs source data before its first scan.
    // There is no fixed sleep: sync work and the scan are immediately queued.
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
 * Immediate scan for an explicit Search action. The plan-specific daily
 * allowance protects this manual trigger from abuse. If it is exhausted, the
 * active search still joins the next continuous market cycle within minutes.
 */
export async function startSearchScan(admin: SupabaseClient, userId: string, searchId: string, action: 'create' | 'resume', now = new Date()): Promise<boolean> {
  const { data: existing, error: existingError } = await admin
    .from('engine_tasks')
    .select('status')
    .eq('kind', 'scan_search')
    .eq('search_id', searchId)
    .in('status', ['queued', 'running'])
    .limit(1)
  if (existingError) throw existingError
  if (existing?.length) return true

  const { data: allowed, error } = await admin.rpc('claim_immediate_scan', { uid: userId })
  if (error) throw error
  if (!allowed) return false
  if (action === 'create') await enqueueFirstScan(admin, userId, searchId, now)
  else await enqueueResumeScan(admin, userId, searchId, now)
  return true
}

export const MISSING_BOARD_RECHECK_DAYS = 7

export async function boardsToSync(admin: SupabaseClient, now = new Date()) {
  const { data, error } = await admin.from('source_health').select('provider, slug').gt('recheck_after', now.toISOString())
  if (error) throw error
  const skip = new Set((data ?? []).map(r => `${r.provider}:${r.slug}`))
  return COMPANY_BOARDS.filter(b => !skip.has(`${b.provider}:${b.slug}`))
}

async function enqueueSyncs(admin: SupabaseClient, tag: string, runAfter?: Date) {
  for (const board of await boardsToSync(admin)) {
    await enqueue(admin, {
      kind: 'sync_source',
      dedupe_key: `sync:${board.provider}:${board.slug}:${tag}`,
      payload: { ...board },
      ...(runAfter ? { run_after: runAfter } : {}),
    })
  }
}

/**
 * Return the stable slice of boards assigned to one market cycle. The registry
 * index is used (rather than the filtered health list) so a temporarily missing
 * board cannot reshuffle every other company's schedule.
 */
export function sourceSchedule(cycle: string): { tag: string; boards: CompanyBoard[] } {
  const cycleNumber = Number.parseInt(cycle, 10)
  const safeCycle = Number.isFinite(cycleNumber) ? cycleNumber : Math.floor(Date.now() / MARKET_CYCLE_MS)
  const slot = ((safeCycle % SOURCE_REFRESH_CYCLES) + SOURCE_REFRESH_CYCLES) % SOURCE_REFRESH_CYCLES
  const window = Math.floor(safeCycle / SOURCE_REFRESH_CYCLES)
  return {
    tag: `window:${window}`,
    boards: COMPANY_BOARDS.filter((_, index) => index % SOURCE_REFRESH_CYCLES === slot),
  }
}

async function enqueueScheduledSyncs(admin: SupabaseClient, cycle: string, runAfter: Date) {
  const { tag, boards } = sourceSchedule(cycle)
  if (!boards.length) return
  const healthy = new Set((await boardsToSync(admin)).map(board => `${board.provider}:${board.slug}`))
  for (const board of boards) {
    if (!healthy.has(`${board.provider}:${board.slug}`)) continue
    await enqueue(admin, {
      kind: 'sync_source',
      dedupe_key: `sync:${board.provider}:${board.slug}:${tag}`,
      payload: { ...board },
      run_after: runAfter,
    })
  }
}

/**
 * Queue one fresh-market pass. Active searches use the already-fresh job index
 * immediately. Direct ATS refreshes start one minute later. Optional global
 * discovery is independently deduped to its configured interval and, when it
 * finds jobs, schedules another scan immediately after ingestion.
 */
async function runMarketCycle(admin: SupabaseClient, task: Task) {
  const cycle = typeof task.payload.cycle === 'string' ? task.payload.cycle : marketCycleKey(new Date())
  const { data: searches, error } = await admin.from('searches').select('id, user_id').eq('status', 'active')
  if (error) throw error
  const discoverySlot = globalDiscoverySlot()
  const discoveryOn = globalDiscoveryEnabled()

  for (const s of searches ?? []) {
    const { data: access, error: accessError } = await admin.rpc('has_active_access', { uid: s.user_id })
    if (accessError) throw accessError
    if (!access) continue
    await enqueue(admin, {
      kind: 'scan_search',
      dedupe_key: `scan:${s.id}:cycle:${cycle}`,
      user_id: s.user_id,
      search_id: s.id,
      payload: { phase: 'start', trigger: 'continuous', cycle },
    })
    if (discoveryOn) {
      await enqueue(admin, {
        kind: 'discover_search',
        dedupe_key: `discover:${s.id}:${discoverySlot}`,
        user_id: s.user_id,
        search_id: s.id,
        payload: { discovery_slot: discoverySlot },
      })
    }
  }
  await enqueueScheduledSyncs(admin, cycle, new Date(Date.now() + SOURCE_REFRESH_DELAY_MS))
}

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

async function runDiscoveryTask(admin: SupabaseClient, task: Task) {
  if (!task.search_id || !task.user_id) return complete(admin, task)
  const result = await discoverGlobalJobs(admin, task.search_id)
  if (!result.upserted) return complete(admin, task)

  const slot = typeof task.payload.discovery_slot === 'string' ? task.payload.discovery_slot : globalDiscoverySlot()
  await enqueue(admin, {
    kind: 'scan_search',
    dedupe_key: `scan:${task.search_id}:global:${slot}`,
    user_id: task.user_id,
    search_id: task.search_id,
    payload: { phase: 'start', trigger: 'global_discovery', discovery_slot: slot },
  })
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
  const cycle = typeof task.payload.cycle === 'string' ? task.payload.cycle : null
  const key = cycle ? `decide:${userId}:${cycle}` : `decide:${userId}:${runId}`
  await enqueue(admin, { kind: 'decide_preparation', dedupe_key: key, user_id: userId, payload: cycle ? { cycle } : {} })
  return complete(admin, task)
}

function reservedIds(payload: Record<string, unknown>): string[] | null {
  const value = payload.reserved_opportunity_ids
  if (!Array.isArray(value)) return null
  return value.filter((id): id is string => typeof id === 'string')
}

async function runDecideTask(admin: SupabaseClient, task: Task) {
  const { count, error: scanError } = await admin
    .from('engine_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'scan_search')
    .eq('user_id', task.user_id!)
    .eq('status', 'running')
  if (scanError) throw scanError
  if (count) return requeue(admin, task, task.payload, 5_000)

  let reserved = reservedIds(task.payload)
  if (reserved === null) {
    if (await preparationBlockedUntil(admin)) return complete(admin, task)
    const { data: access, error: accessError } = await admin.rpc('has_active_access', { uid: task.user_id })
    if (accessError) throw accessError
    reserved = access ? await decidePreparation(admin, task.user_id!) : []
    if (!reserved.length) return complete(admin, task)
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
    case 'discover_search':
      return runDiscoveryTask(admin, task)
    case 'scan_search':
      return runScanTask(admin, task)
    case 'decide_preparation':
      return runDecideTask(admin, task)
    case 'prepare_package': {
      const blockedUntil = await preparationBlockedUntil(admin, now)
      if (blockedUntil) {
        const { error } = await admin.from('engine_tasks').update({
          status: 'queued', run_after: blockedUntil, locked_until: null,
          attempts: Math.max(0, task.attempts - 1),
        }).eq('id', task.id)
        if (error) throw error
        return
      }
      const packageId = typeof task.payload.package_id === 'string' ? task.payload.package_id : undefined
      await generatePackage(admin, task.opportunity_id!, packageId)
      return complete(admin, task)
    }
  }
}

export async function handleFailure(admin: SupabaseClient, task: Task, err: unknown) {
  const message = errorMessage(err)
  console.error('engine task failed', { kind: task.kind, taskId: task.id, attempts: task.attempts, error: message })
  const permanentAIError = err instanceof AIRequestError && !err.retriable
  if (permanentAIError || task.attempts >= task.max_attempts) {
    // Cleanup first: if it fails, keep the task leased for database recovery.
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
    const { error } = await admin.from('engine_tasks').update({
      status: 'failed', last_error: message.slice(0, 2000), locked_until: null,
      ...(permanentAIError ? { run_after: new Date(Date.now() + AI_FAILURE_COOLDOWN_MS).toISOString() } : {}),
    }).eq('id', task.id)
    if (error) throw error
    return
  }
  const { error } = await admin
    .from('engine_tasks')
    .update({ status: 'queued', last_error: message.slice(0, 2000), locked_until: null, run_after: new Date(Date.now() + task.attempts * 60_000).toISOString() })
    .eq('id', task.id)
  if (error) throw error
}

/** Supabase and fetch clients sometimes reject with plain objects. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const value = err as Record<string, unknown>
    const parts = [value.message, value.details, value.hint, value.code]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    if (parts.length) return [...new Set(parts)].join(' | ')
    try {
      const serialized = JSON.stringify(err)
      if (serialized && serialized !== '{}') return serialized
    } catch {
      // Fall through to the safe generic message.
    }
  }
  return 'Unknown engine error'
}

export type WorkerResult = { processed: number; failed: number }

export async function runWorker(admin: SupabaseClient, opts: { budgetMs: number; concurrency?: number; leaseSeconds?: number }): Promise<WorkerResult> {
  const deadline = Date.now() + opts.budgetMs
  const concurrency = opts.concurrency ?? 4
  let processed = 0
  let failed = 0
  // A package can make two validation calls. Leave room for both before
  // claiming another batch in production's four-minute worker window.
  const headroom = opts.budgetMs >= 2 * AI_REQUEST_TIMEOUT_MS + 10_000 ? 2 * AI_REQUEST_TIMEOUT_MS + 10_000 : 0
  while (Date.now() <= deadline - headroom) {
    const { data, error } = await admin.rpc('claim_engine_tasks', { p_limit: concurrency, p_lease_seconds: opts.leaseSeconds ?? 600 })
    if (error) throw error
    const tasks = (data ?? []) as Task[]
    if (!tasks.length) break
    const outcomes = await Promise.allSettled(
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
    const cleanupErrors = outcomes.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Engine task failure cleanup failed')
  }
  return { processed, failed }
}

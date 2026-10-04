import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COMPANY_BOARDS, type CompanyBoard } from './companies'
import { syncBoard } from './ingest'
import { SourceError } from './sources'
import { decidePreparation, failPackage, generatePackage } from './prepare'
import { evaluateBatch, finalizeRun, startScan } from './scan'

// Work queue for the Opportunity Engine (public.engine_tasks).
//
// A cron tick (every few minutes) runs the worker for a bounded time. Work is
// split into small tasks so a nightly run for many users never depends on one
// long function invocation:
//   nightly            → enqueues tonight's source syncs and search scans
//   sync_source        → one company board (Greenhouse / Lever / Ashby)
//   scan_search        → one search: start → evaluate (in batches) → finalize
//   decide_preparation → Stage 6 for one user, after their scans finish
//   prepare_package    → Stage 7 for one opportunity/package reservation

export type TaskKind = 'nightly' | 'sync_source' | 'scan_search' | 'decide_preparation' | 'prepare_package'

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

/** [DERIVED] Nightly run start, in UTC. Scans start after the source syncs. */
export const NIGHTLY_HOUR_UTC = Number(process.env.ENGINE_NIGHTLY_HOUR_UTC ?? 2)
export const SCAN_DELAY_MINUTES = 30

export const utcDate = (d: Date) => d.toISOString().slice(0, 10)

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

/** Makes sure tonight's run is queued (idempotent; called on every tick). */
export async function ensureNightly(admin: SupabaseClient, now = new Date()): Promise<void> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), NIGHTLY_HOUR_UTC))
  if (now < start) return
  await enqueue(admin, { kind: 'nightly', dedupe_key: `nightly:${utcDate(now)}`, run_after: start })
}

/** First scan right after onboarding (and after a search is created later). */
export async function enqueueFirstScan(admin: SupabaseClient, userId: string, searchId: string): Promise<void> {
  const { count } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true)
  let runAfter = new Date()
  if (!count) {
    // Fresh deployment with no postings yet: sync the boards first.
    await enqueueSyncs(admin, `bootstrap:${utcDate(runAfter)}`)
    runAfter = new Date(Date.now() + 10 * 60_000)
  }
  await enqueue(admin, { kind: 'scan_search', dedupe_key: `scan:${searchId}:first`, user_id: userId, search_id: searchId, payload: { phase: 'start', trigger: 'first' }, run_after: runAfter })
}

/**
 * Scan right after a paused search is resumed (decision 2026-10-01). It shares
 * the nightly scan's dedupe key, so a search gets at most one scan per UTC day
 * however often it is paused and resumed.
 */
export async function enqueueResumeScan(admin: SupabaseClient, userId: string, searchId: string, now = new Date()): Promise<void> {
  const day = utcDate(now)
  await enqueue(admin, { kind: 'scan_search', dedupe_key: `scan:${searchId}:${day}`, user_id: userId, search_id: searchId, payload: { phase: 'start', trigger: 'resume', day } })
}

/**
 * Immediate scan for a Search action (D8): a new active search ('create') or a
 * resumed one ('resume'). Within the user's daily allowance
 * (public.claim_immediate_scan) the scan is queued now; beyond it nothing is
 * queued and the active search waits for the nightly scan. A resumed search
 * that already has today's scan queued or running uses no allowance; one
 * already scanned today keeps the per-search daily guard. Returns whether a
 * scan is queued or running now.
 */
export async function startSearchScan(admin: SupabaseClient, userId: string, searchId: string, action: 'create' | 'resume', now = new Date()): Promise<boolean> {
  if (action === 'resume') {
    const { data: today } = await admin.from('engine_tasks').select('status').eq('dedupe_key', `scan:${searchId}:${utcDate(now)}`).maybeSingle()
    if (today) return today.status === 'queued' || today.status === 'running'
  }
  const { data: allowed, error } = await admin.rpc('claim_immediate_scan', { uid: userId })
  if (error) throw error
  if (!allowed) return false
  if (action === 'create') await enqueueFirstScan(admin, userId, searchId)
  else await enqueueResumeScan(admin, userId, searchId, now)
  return true
}

/** A missing board (404 / 410) is rechecked once a week, with a single attempt. */
export const MISSING_BOARD_RECHECK_DAYS = 7

/** The configured boards to sync now: boards confirmed missing are skipped until their recheck is due. */
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

/**
 * One board sync (D8). Success clears any "missing" record. A missing board
 * (404 / 410) is recorded and not retried; other non-retriable failures
 * (4xx, malformed responses) fail once and are tried again tomorrow;
 * temporary ones (429, 5xx, timeouts, network) are rethrown and retried with
 * backoff. last_error always says provider/slug, HTTP status and failure class.
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

async function runNightly(admin: SupabaseClient, now: Date) {
  const day = utcDate(now)
  await enqueueSyncs(admin, day)

  const { data: searches, error } = await admin.from('searches').select('id, user_id').eq('status', 'active')
  if (error) throw error
  const scanAt = new Date(now.getTime() + SCAN_DELAY_MINUTES * 60_000)
  for (const s of searches ?? []) {
    const { data: access } = await admin.rpc('has_active_access', { uid: s.user_id })
    if (!access) continue // read-only accounts: no searching, no preparing
    await enqueue(admin, { kind: 'scan_search', dedupe_key: `scan:${s.id}:${day}`, user_id: s.user_id, search_id: s.id, payload: { phase: 'start', trigger: 'nightly', day }, run_after: scanAt })
  }
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
    if (!started) return complete(admin, task) // search paused or account read-only
    return requeue(admin, task, { ...task.payload, phase: started.pending ? 'evaluate' : 'finalize', run_id: started.runId })
  }
  const runId = task.payload.run_id as string
  if (phase === 'evaluate') {
    const { remaining } = await evaluateBatch(admin, runId)
    return requeue(admin, task, { ...task.payload, phase: remaining ? 'evaluate' : 'finalize' })
  }
  const { userId } = await finalizeRun(admin, runId)
  await complete(admin, task)
  const key = task.payload.trigger === 'nightly' ? `decide:${userId}:${task.payload.day}` : `decide:${userId}:${runId}`
  await enqueue(admin, { kind: 'decide_preparation', dedupe_key: key, user_id: userId })
}

function reservedIds(payload: Record<string, unknown>): string[] | null {
  const value = payload.reserved_opportunity_ids
  if (!Array.isArray(value)) return null
  return value.filter((id): id is string => typeof id === 'string')
}

async function runDecideTask(admin: SupabaseClient, task: Task) {
  // Wait until the user's other scans are finished, so "top 2" is across all their searches.
  const { count } = await admin
    .from('engine_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'scan_search')
    .eq('user_id', task.user_id!)
    .in('status', ['queued', 'running'])
  if (count) return requeue(admin, task, task.payload, 2 * 60_000)

  let reserved = reservedIds(task.payload)
  if (reserved === null) {
    const { data: access } = await admin.rpc('has_active_access', { uid: task.user_id })
    reserved = access ? await decidePreparation(admin, task.user_id!) : []
    if (!reserved.length) return complete(admin, task)

    // Persist the reservation list before queueing package work. If the worker
    // dies while queueing, its retry reuses exactly these reservations instead
    // of selecting and reserving another set.
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
    // A reservation may already have been finalized by a previous worker
    // attempt. In that case there is intentionally nothing left to enqueue.
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
    case 'nightly':
      await runNightly(admin, now)
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
  // Retry with backoff; keeps its progress (phase/run id) in the payload.
  const { error } = await admin
    .from('engine_tasks')
    .update({ status: 'queued', last_error: message.slice(0, 2000), locked_until: null, run_after: new Date(Date.now() + task.attempts * 5 * 60_000).toISOString() })
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

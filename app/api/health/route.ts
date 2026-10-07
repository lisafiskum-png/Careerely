import { createAdminClient } from '../../../lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Due work waiting longer than this (three 5-minute ticks) means the worker is not keeping up. */
const MAX_TASK_WAIT_MINUTES = 15
/** A search run still running after this is stuck. */
const STALE_RUN_MINUTES = 15
/** Two ticks: an expired lease is normally reclaimed by the next tick. */
const LEASE_GRACE_MINUTES = 10

/** Minimal, non-sensitive endpoint for uptime checks. */
export async function GET() {
  const started = Date.now()
  try {
    const admin = createAdminClient()
    const now = Date.now()
    const staleBefore = new Date(now - STALE_RUN_MINUTES * 60_000).toISOString()
    const [database, claimable, oldestClaimable, staleRuns, expiredLeases] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('engine_tasks').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('run_after', new Date(now).toISOString()),
      admin.from('engine_tasks').select('run_after').eq('status', 'queued').lte('run_after', new Date(now).toISOString()).order('run_after').limit(1).maybeSingle(),
      admin.from('search_runs').select('id', { count: 'exact', head: true }).eq('status', 'running').lt('started_at', staleBefore),
      // A lease that expired since the last tick is reclaimed by the next one.
      admin.from('engine_tasks').select('id', { count: 'exact', head: true }).eq('status', 'running').lt('locked_until', new Date(now - LEASE_GRACE_MINUTES * 60_000).toISOString()),
    ])
    const error = database.error ?? claimable.error ?? oldestClaimable.error ?? staleRuns.error ?? expiredLeases.error
    if (error) throw error

    const claimableCount = claimable.count ?? 0
    const oldestWaitMinutes = oldestClaimable.data ? Math.max(0, Math.floor((now - new Date(oldestClaimable.data.run_after).getTime()) / 60_000)) : 0
    const staleRunCount = staleRuns.count ?? 0
    const expiredLeaseCount = expiredLeases.count ?? 0
    // Backlog is judged by how long due work has waited, not how much there
    // is: every market cycle legitimately queues one scan per active search.
    const queueHealthy = oldestWaitMinutes <= MAX_TASK_WAIT_MINUTES && staleRunCount === 0 && expiredLeaseCount === 0
    return Response.json(
      {
        status: queueHealthy ? 'ok' : 'degraded',
        database: 'ok',
        queue: queueHealthy ? 'ok' : 'backlogged',
        claimable_tasks: claimableCount,
        oldest_task_wait_minutes: oldestWaitMinutes,
        stale_search_runs: staleRunCount,
        expired_task_leases: expiredLeaseCount,
        latency_ms: Date.now() - started,
      },
      { status: queueHealthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('health check failed', { error: err instanceof Error ? err.message : 'Database unavailable' })
    return Response.json(
      { status: 'degraded', database: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

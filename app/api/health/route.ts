import { createAdminClient } from '../../../lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Minimal, non-sensitive endpoint for uptime checks. */
export async function GET() {
  const started = Date.now()
  try {
    const admin = createAdminClient()
    const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString()
    const [database, claimable, staleRuns, expiredLeases] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('engine_tasks').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('run_after', new Date().toISOString()),
      admin.from('search_runs').select('id', { count: 'exact', head: true }).eq('status', 'running').lt('started_at', staleBefore),
      admin.from('engine_tasks').select('id', { count: 'exact', head: true }).eq('status', 'running').lt('locked_until', new Date().toISOString()),
    ])
    const error = database.error ?? claimable.error ?? staleRuns.error ?? expiredLeases.error
    if (error) throw error

    const claimableCount = claimable.count ?? 0
    const staleRunCount = staleRuns.count ?? 0
    const expiredLeaseCount = expiredLeases.count ?? 0
    const queueHealthy = claimableCount <= 20 && staleRunCount === 0 && expiredLeaseCount === 0
    return Response.json(
      {
        status: queueHealthy ? 'ok' : 'degraded',
        database: 'ok',
        queue: queueHealthy ? 'ok' : 'backlogged',
        claimable_tasks: claimableCount,
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

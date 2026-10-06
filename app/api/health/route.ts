import { createAdminClient } from '../../../lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Minimal, non-sensitive endpoint for uptime checks. */
export async function GET() {
  const started = Date.now()
  try {
    const { error } = await createAdminClient().from('profiles').select('id').limit(1)
    if (error) throw error
    return Response.json(
      { status: 'ok', database: 'ok', latency_ms: Date.now() - started },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('health check failed', { error: err instanceof Error ? err.message : 'Database unavailable' })
    return Response.json(
      { status: 'degraded', database: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

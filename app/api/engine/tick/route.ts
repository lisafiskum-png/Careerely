import { createAdminClient } from '../../../../lib/supabase/admin'
import { ensureMarketCycle, errorMessage, runWorker } from '../../../../lib/engine/queue'

// Opportunity Engine scheduler. Supabase Cron calls this frequently with
// `Authorization: Bearer <CRON_SECRET>`. Every call makes sure the current
// five-minute market cycle exists, then drains useful work immediately. The
// worker budget stays below the one-minute scheduler cadence so ticks do not
// intentionally stack on top of each other.

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const WORK_BUDGET_MS = 40_000

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  try {
    await ensureMarketCycle(admin)
    const result = await runWorker(admin, { budgetMs: WORK_BUDGET_MS })
    console.info('engine tick complete', result)
    return Response.json(result)
  } catch (err) {
    console.error('engine tick failed', { error: errorMessage(err) })
    return Response.json({ error: 'Engine tick failed' }, { status: 500 })
  }
}

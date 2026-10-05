import { createAdminClient } from '../../../../lib/supabase/admin'
import { ensureMarketCycle, runWorker } from '../../../../lib/engine/queue'

// Opportunity Engine scheduler. Supabase Cron calls this frequently with
// `Authorization: Bearer <CRON_SECRET>`. Every call makes sure the current
// five-minute market cycle exists, then drains useful work immediately. The
// worker budget stays below the one-minute scheduler cadence so ticks do not
// intentionally stack on top of each other.

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const WORK_BUDGET_MS = 50_000

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  await ensureMarketCycle(admin)
  const result = await runWorker(admin, { budgetMs: WORK_BUDGET_MS })
  return Response.json(result)
}

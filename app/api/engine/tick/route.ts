import { createAdminClient } from '../../../../lib/supabase/admin'
import { ensureNightly, runWorker } from '../../../../lib/engine/queue'

// Opportunity Engine scheduler. Called every 5 minutes by Supabase Cron
// (pg_cron + pg_net; see README → Scheduling) with
// `Authorization: Bearer <CRON_SECRET>`. Each call queues tonight's run if it's
// due, then works through the queue for a bounded time.

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const WORK_BUDGET_MS = 240_000

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  await ensureNightly(admin)
  const result = await runWorker(admin, { budgetMs: WORK_BUDGET_MS })
  return Response.json(result)
}

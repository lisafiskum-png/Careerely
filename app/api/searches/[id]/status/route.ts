import { after } from 'next/server'
import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { readOnlyResponse } from '../../../../../lib/write-access'
import { createClient } from '../../../../../lib/supabase/server'
import { createAdminClient } from '../../../../../lib/supabase/admin'
import { runWorker, startSearchScan } from '../../../../../lib/engine/queue'
import { searchWriteError } from '../../../../../lib/search-input'

// Pause or resume a search (Master Brief §12). Resuming at the plan's
// active-search limit is refused (the database enforces it) and nothing
// changes. A resumed search is scanned right away, at most once per search per
// day (shared with the nightly scan), so pausing and resuming repeatedly can't
// start repeated scans.
const Body = z.object({ status: z.enum(['active', 'paused']) })

// A new or resumed active search starts its scan in after(); give it the same
// time as the cron tick and onboarding (the worker budget is 240s).
export const maxDuration = 300

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await ctx.params
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const readOnly = await readOnlyResponse()
    if (readOnly) return readOnly

    const supabase = await createClient()
    const { data: current } = await supabase.from('searches').select('id, status').eq('id', id).maybeSingle()
    if (!current) return Response.json({ error: 'Not found' }, { status: 404 })
    if (current.status === parsed.data.status) return Response.json({ status: current.status })

    const { data, error } = await supabase.from('searches').update({ status: parsed.data.status }).eq('id', id).select('id').maybeSingle()
    if (error) return searchWriteError(error)
    if (!data) return Response.json({ error: 'Your account can’t change searches right now.' }, { status: 403 })

    // A resumed search scans now, within the user's daily allowance of
    // immediate scans (and at most once per search per day); otherwise it
    // waits for tonight's scan (still active).
    let immediateScan = false
    if (parsed.data.status === 'active') {
      try {
        immediateScan = await startSearchScan(createAdminClient(), user.id, id, 'resume')
      } catch (err) {
        // The search is saved and active either way; it then waits for tonight's scan.
        console.error('immediate scan not started', err)
      }
      if (immediateScan) {
        after(async () => {
          try {
            await runWorker(createAdminClient(), { budgetMs: 240_000 })
          } catch (err) {
            console.error('resume scan kickoff failed', err)
          }
        })
      }
    }
    return Response.json(parsed.data.status === 'active' ? { status: 'active', immediateScan } : { status: 'paused' })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('search status update failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

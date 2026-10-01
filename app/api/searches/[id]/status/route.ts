import { after } from 'next/server'
import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { createClient } from '../../../../../lib/supabase/server'
import { createAdminClient } from '../../../../../lib/supabase/admin'
import { enqueueResumeScan, runWorker } from '../../../../../lib/engine/queue'
import { searchWriteError } from '../../../../../lib/search-input'

// Pause or resume a search (Master Brief §12). Resuming at the plan's
// active-search limit is refused (the database enforces it) and nothing
// changes. A resumed search is scanned right away, at most once per search per
// day (shared with the nightly scan), so pausing and resuming repeatedly can't
// start repeated scans.
const Body = z.object({ status: z.enum(['active', 'paused']) })

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await ctx.params
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid request' }, { status: 400 })

    const supabase = await createClient()
    const { data: current } = await supabase.from('searches').select('id, status').eq('id', id).maybeSingle()
    if (!current) return Response.json({ error: 'Not found' }, { status: 404 })
    if (current.status === parsed.data.status) return Response.json({ status: current.status })

    const { data, error } = await supabase.from('searches').update({ status: parsed.data.status }).eq('id', id).select('id').maybeSingle()
    if (error) return searchWriteError(error)
    if (!data) return Response.json({ error: 'Your account can’t change searches right now.' }, { status: 403 })

    if (parsed.data.status === 'active') {
      await enqueueResumeScan(createAdminClient(), user.id, id)
      after(async () => {
        try {
          await runWorker(createAdminClient(), { budgetMs: 240_000 })
        } catch (err) {
          console.error('resume scan kickoff failed', err)
        }
      })
    }
    return Response.json({ status: parsed.data.status })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('search status update failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

import { after } from 'next/server'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../lib/auth'
import { readOnlyResponse } from '../../../lib/write-access'
import { createClient } from '../../../lib/supabase/server'
import { createAdminClient } from '../../../lib/supabase/admin'
import { enqueueFirstScan, runWorker } from '../../../lib/engine/queue'
import { searchColumns, searchWriteError, validateSearch } from '../../../lib/search-input'

// Create a search (Master Brief §12). The user chooses "Start search" or, at
// the plan's active-search limit, "Save as paused". A search is never paused
// silently: if an active search hits the limit, nothing is saved and the
// response says so, so the form can offer "Save as paused" instead.
// A new or resumed active search starts its scan in after(); give it the same
// time as the cron tick and onboarding (the worker budget is 240s).
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const parsed = validateSearch(body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    const readOnly = await readOnlyResponse()
    if (readOnly) return readOnly
    const status = body?.status === 'paused' ? 'paused' : 'active'

    // RLS: own row and an active plan; the database enforces the active-search limit.
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('searches')
      .insert({ ...searchColumns(parsed.value), user_id: user.id, status, created_from_profile: false })
      .select('id')
      .single()
    if (error) return searchWriteError(error)

    if (status === 'active') {
      // First scan now, as after onboarding, instead of waiting for tonight's run.
      const admin = createAdminClient()
      await enqueueFirstScan(admin, user.id, data.id)
      after(async () => {
        try {
          await runWorker(createAdminClient(), { budgetMs: 240_000 })
        } catch (err) {
          console.error('first scan kickoff failed', err)
        }
      })
    }
    return Response.json({ id: data.id, status })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('create search failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

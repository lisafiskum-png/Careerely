import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { readOnlyResponse } from '../../../../lib/write-access'
import { createClient } from '../../../../lib/supabase/server'

// Dismisses the "paused when your plan changed" notice (Phase D6). User-level
// state only: no search changes, and each search keeps its provenance
// (paused_by_plan_change_at), which only resuming clears.
export async function DELETE() {
  try {
    await requireUser()
    const readOnly = await readOnlyResponse()
    if (readOnly) return readOnly
    const supabase = await createClient()
    const { error } = await supabase.rpc('dismiss_plan_change_notice')
    if (error) return Response.json({ error: 'Couldn’t dismiss this notice.' }, { status: 409 })
    return Response.json({ dismissed: true })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('dismiss plan-change notice failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { createClient } from '../../../../lib/supabase/server'

// Dismisses the "paused when your plan changed" notice (Phase D6): clears the
// marker on the user's own searches. The searches stay paused.
export async function DELETE() {
  try {
    await requireUser()
    // RLS: own searches, active plan.
    const supabase = await createClient()
    const { error } = await supabase.from('searches').update({ paused_by_plan_change_at: null }).not('paused_by_plan_change_at', 'is', null)
    if (error) return Response.json({ error: 'Couldn’t dismiss this notice.' }, { status: 409 })
    return Response.json({ dismissed: true })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('dismiss plan-change notice failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

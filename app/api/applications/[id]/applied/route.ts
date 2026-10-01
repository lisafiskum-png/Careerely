import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { readOnlyResponse } from '../../../../../lib/write-access'
import { createClient } from '../../../../../lib/supabase/server'
import { createAdminClient } from '../../../../../lib/supabase/admin'

// "Did you apply? → Yes, I applied". The only way an application becomes
// Applied: opening the posting never changes the status by itself.
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
    const readOnly = await readOnlyResponse()
    if (readOnly) return readOnly

    const supabase = await createClient()
    // RLS: only the user's own applications are visible.
    const { data: current } = await supabase.from('applications').select('id').eq('id', id).maybeSingle()
    if (!current) return Response.json({ error: 'Not found' }, { status: 404 })
    const now = new Date().toISOString()
    // RLS limits this to the user's own application and an active plan.
    const { data: app, error } = await supabase
      .from('applications')
      .update({ status: 'applied', applied_at: now, status_updated_at: now })
      .eq('id', id)
      .eq('status', 'ready_to_apply')
      .select('id, opportunity_id')
      .maybeSingle()
    if (error) throw error
    if (!app) return Response.json({ error: 'This application can’t be marked as applied.' }, { status: 409 })

    // The status change stands; a lost activity event (Recent activity, the
    // panel timeline) is logged rather than reported as a failed action.
    const { error: activityError } = await createAdminClient()
      .from('activity')
      .insert({ user_id: user.id, kind: 'application_applied', opportunity_id: app.opportunity_id, application_id: app.id, payload: {} })
    if (activityError) console.error('activity insert failed (application_applied)', app.id, activityError)
    return Response.json({ status: 'applied' })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('mark applied failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

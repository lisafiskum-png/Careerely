import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { createClient } from '../../../../../lib/supabase/server'
import { createAdminClient } from '../../../../../lib/supabase/admin'

// "Did you apply? → Yes, I applied". The only way an application becomes
// Applied: opening the posting never changes the status by itself.
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })

    const supabase = await createClient()
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

    await createAdminClient()
      .from('activity')
      .insert({ user_id: user.id, kind: 'application_applied', opportunity_id: app.opportunity_id, application_id: app.id, payload: {} })
    return Response.json({ status: 'applied' })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('mark applied failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

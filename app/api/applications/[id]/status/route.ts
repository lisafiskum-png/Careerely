import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { createClient } from '../../../../../lib/supabase/server'
import { createAdminClient } from '../../../../../lib/supabase/admin'

// Manual status tracking for a submitted application (Master Brief §11):
// stages Applied / Interview / Offer, closed outcomes Declined / Withdrawn.
// Choosing a stage on a closed application reopens it. An application never
// returns to Ready to apply (only "Yes, I applied" moves it out of there).
// Each change is recorded as an activity event, which is the timeline.
const Body = z.union([
  z.object({ status: z.enum(['applied', 'interview', 'offer']) }),
  z.object({ outcome: z.enum(['declined', 'withdrawn']) }),
])

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await ctx.params
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid request' }, { status: 400 })

    const supabase = await createClient()
    const { data: current } = await supabase.from('applications').select('id, status, outcome, opportunity_id').eq('id', id).maybeSingle()
    if (!current) return Response.json({ error: 'Not found' }, { status: 404 })
    if (current.status === 'ready_to_apply') {
      return Response.json({ error: 'Confirm that you applied first.' }, { status: 409 })
    }

    const change = 'status' in parsed.data ? { status: parsed.data.status, outcome: null } : { status: current.status, outcome: parsed.data.outcome }
    if (change.status === current.status && change.outcome === current.outcome) return Response.json({ status: change.status, outcome: change.outcome })

    // RLS: own application and an active plan (read-only accounts can't update).
    const { error } = await supabase
      .from('applications')
      .update({ ...change, status_updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .single()
    if (error) return Response.json({ error: 'Couldn’t update this application.' }, { status: 409 })

    await createAdminClient()
      .from('activity')
      .insert({ user_id: user.id, kind: 'application_status_changed', opportunity_id: current.opportunity_id, application_id: id, payload: change })
    return Response.json(change)
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('application status update failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

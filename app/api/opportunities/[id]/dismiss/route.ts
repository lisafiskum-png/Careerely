import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { createClient } from '../../../../../lib/supabase/server'

const Body = z.object({ reason: z.enum(['role', 'company', 'location', 'salary', 'industry', 'other']).nullable().optional() })

// "Not for me". Dismisses a Shortlisted opportunity immediately; the optional
// quick reason (Role · Company · Location · Salary · Industry · Other) can be
// sent afterwards. Stored only: using reasons to steer the engine is post-launch.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser()
    const { id } = await ctx.params
    const parsed = Body.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const reason = parsed.data.reason ?? null

    const supabase = await createClient()
    const { data: opp } = await supabase.from('opportunities').select('id, state, dismissed_at').eq('id', id).maybeSingle()
    if (!opp) return Response.json({ error: 'Not found' }, { status: 404 })

    if (opp.dismissed_at) {
      if (!reason) return Response.json({ status: 'dismissed' })
      const { error } = await supabase.from('opportunities').update({ dismiss_reason: reason }).eq('id', id).select('id').single()
      if (error) return Response.json({ error: 'Could not save the reason.' }, { status: 409 })
      return Response.json({ status: 'dismissed' })
    }
    if (opp.state !== 'shortlisted') {
      return Response.json({ error: 'Only shortlisted opportunities can be dismissed.' }, { status: 409 })
    }
    const { error } = await supabase
      .from('opportunities')
      .update({ dismissed_at: new Date().toISOString(), dismiss_reason: reason })
      .eq('id', id)
      .eq('state', 'shortlisted')
      .select('id')
      .single()
    // RLS: a read-only account (no active plan) cannot dismiss.
    if (error) return Response.json({ error: 'Could not dismiss this opportunity.' }, { status: 409 })
    return Response.json({ status: 'dismissed' })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('dismiss failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

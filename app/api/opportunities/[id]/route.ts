import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { createClient } from '../../../../lib/supabase/server'
import { loadOpportunityDetail } from '../../../../lib/opportunity-detail'

// The opportunity panel's content. Row level security limits it to the
// signed-in user's own opportunities.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser()
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
    const detail = await loadOpportunityDetail(await createClient(), id)
    if (!detail) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(detail)
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('opportunity detail failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

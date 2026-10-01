import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { readOnlyResponse } from '../../../../../lib/write-access'
import { createClient } from '../../../../../lib/supabase/server'
import { applicationChangeError } from '../../../../../lib/application-changes'

// "Did you apply? → Yes, I applied". The only way an application becomes
// Applied: opening the posting never changes the status by itself. The
// change and its single application_applied history event are written in one
// transaction by public.mark_application_applied (own application, active
// plan); a repeated request changes and records nothing.
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser()
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
    const readOnly = await readOnlyResponse()
    if (readOnly) return readOnly

    const supabase = await createClient()
    const { error } = await supabase.rpc('mark_application_applied', { p_application_id: id })
    if (error) return applicationChangeError(error, 'This application can’t be marked as applied.')
    return Response.json({ status: 'applied' })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('mark applied failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../lib/auth'
import { readOnlyResponse } from '../../../../../lib/write-access'
import { createClient } from '../../../../../lib/supabase/server'
import { applicationChangeError } from '../../../../../lib/application-changes'

// Manual status tracking for a submitted application (Master Brief §11):
// stages Applied / Interview / Offer, closed outcomes Declined / Withdrawn.
// Choosing a stage on a closed application reopens it. An application never
// returns to Ready to apply (only "Yes, I applied" moves it out of there).
// public.set_application_status writes the change and its single
// application_status_changed event (the timeline) in one transaction;
// choosing the current state records nothing.
const Body = z.union([
  z.object({ status: z.enum(['applied', 'interview', 'offer']) }),
  z.object({ outcome: z.enum(['declined', 'withdrawn']) }),
])

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser()
    const { id } = await ctx.params
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const readOnly = await readOnlyResponse()
    if (readOnly) return readOnly

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('set_application_status', {
      p_application_id: id,
      p_status: 'status' in parsed.data ? parsed.data.status : null,
      p_outcome: 'outcome' in parsed.data ? parsed.data.outcome : null,
    })
    if (error) return applicationChangeError(error, 'Couldn’t update this application.')
    return Response.json(data)
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('application status update failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

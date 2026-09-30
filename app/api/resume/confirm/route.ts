import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { createClient } from '../../../../lib/supabase/server'
import { normalizeResume, ResumeSchema } from '../../../../lib/resume/schema'

const Body = z.object({ resume: ResumeSchema })

// Step 2 "review" state: saves the resume as corrected by the user.
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Some fields are invalid. Please check and try again.' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('career_profiles')
      .update({ resume_data: normalizeResume(parsed.data.resume), resume_confirmed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .select('user_id')
    if (error) throw error
    if (!data?.length) return Response.json({ error: 'Please upload your resume first.' }, { status: 409 })

    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('resume confirm failed', err)
    return Response.json({ error: 'We couldn’t save your resume. Please try again.' }, { status: 500 })
  }
}

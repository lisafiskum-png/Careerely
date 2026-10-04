import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { createClient } from '../../../../lib/supabase/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { detectResumeKind, extractResumeText, MAX_RESUME_BYTES } from '../../../../lib/resume/extract'
import { parseResume, ResumeParseError } from '../../../../lib/resume/parse'
import { claimUsage } from '../../../../lib/usage'

export const maxDuration = 60

const Body = z.object({ path: z.string().min(1).max(500) })

// Step 2 "parsing" state: reads the uploaded resume from the user's own storage
// folder, extracts the text and asks Claude for the structured resume.
// The result is stored as a draft; the user confirms it on the review screen.
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const { path } = parsed.data

    // Only the caller's own folder, no traversal.
    const segments = path.split('/')
    if (segments.length !== 2 || segments[0] !== user.id || segments[1].includes('..') || !segments[1]) {
      return Response.json({ error: 'Invalid file' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Download as the user, so storage row level security applies. Cheap file
    // validation happens before an AI allowance slot is consumed.
    const supabase = await createClient()
    const { data: file, error: downloadError } = await supabase.storage.from('resumes').download(path)
    if (downloadError || !file) return Response.json({ error: 'We couldn’t find that file. Please upload it again.' }, { status: 404 })
    if (file.size > MAX_RESUME_BYTES) return Response.json({ error: 'This file is over 10MB. Try a smaller version.' }, { status: 413 })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = detectResumeKind(bytes)
    if (!kind) return Response.json({ error: 'We only accept PDF, DOC, or DOCX files.' }, { status: 415 })

    let text = ''
    try {
      text = await extractResumeText(bytes, kind)
    } catch (err) {
      console.error('resume text extraction failed', kind, err)
    }
    if (text.length < 200 && kind !== 'pdf') {
      return Response.json({ error: 'We couldn’t read any text in this file. Try a PDF export of your resume.' }, { status: 422 })
    }

    // Claim and record the rolling-window slot in one database transaction.
    // Parallel requests for the same account cannot overshoot the AI limit.
    if (!(await claimUsage(admin, user.id, 'resume_parse'))) {
      return Response.json(
        { error: 'You’ve uploaded a lot of resumes today. Please try again tomorrow.' },
        { status: 429 },
      )
    }

    const result = await parseResume({ text, pdf: kind === 'pdf' ? bytes : undefined })

    const { error: saveError } = await admin.from('career_profiles').upsert(
      {
        user_id: user.id,
        resume_file_path: path,
        resume_text: text || null,
        resume_data: result.resume,
        suggestions: result.suggestions,
        resume_parsed_at: new Date().toISOString(),
        resume_confirmed_at: null,
      },
      { onConflict: 'user_id' },
    )
    if (saveError) throw saveError

    return Response.json({ resume: result.resume, suggestions: result.suggestions })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    if (err instanceof ResumeParseError) return Response.json({ error: err.message }, { status: 502 })
    console.error('resume parse failed', err)
    return Response.json({ error: 'Something went wrong reading your resume. Please try again.' }, { status: 500 })
  }
}

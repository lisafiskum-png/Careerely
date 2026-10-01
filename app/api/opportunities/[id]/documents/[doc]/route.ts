import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../../../lib/auth'
import { createClient } from '../../../../../../lib/supabase/server'
import { loadOpportunityDetail } from '../../../../../../lib/opportunity-detail'
import { renderTextPdf } from '../../../../../../lib/pdf'

// Download the prepared resume or cover letter as a PDF, generated on demand
// from the stored package. Available to read-only accounts too: their
// documents stay accessible.
export async function GET(_: Request, ctx: { params: Promise<{ id: string; doc: string }> }) {
  try {
    await requireUser()
    const { id, doc } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id) || (doc !== 'resume' && doc !== 'cover-letter')) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const detail = await loadOpportunityDetail(await createClient(), id)
    const pkg = detail?.package
    if (!detail || !pkg || pkg.status !== 'ready') return Response.json({ error: 'Not found' }, { status: 404 })

    const body = doc === 'resume' ? (pkg.resumeText ?? '') : pkg.coverLetter.join('\n\n')
    if (!body.trim()) return Response.json({ error: 'Not found' }, { status: 404 })
    const label = doc === 'resume' ? 'Resume' : 'Cover letter'
    const title = `${label} - ${detail.company || detail.title}`
    const pdf = renderTextPdf({ title, body })
    const filename = `${title.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || label}.pdf`
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('document download failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

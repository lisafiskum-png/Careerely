import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { createClient } from '../../../../lib/supabase/server'
import { searchColumns, searchWriteError, validateSearch } from '../../../../lib/search-input'

// Edit a search's parameters (Master Brief §12). Changes apply to this search
// only and never touch the Career Profile. No immediate rescan (decision
// 2026-10-01): the new settings apply from the next scheduled scan, and
// opportunities already found are left as they are.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser()
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const parsed = validateSearch(await request.json().catch(() => null))
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

    // RLS: own search and an active plan (read-only accounts can't edit).
    const supabase = await createClient()
    const { data: current } = await supabase.from('searches').select('id').eq('id', id).maybeSingle()
    if (!current) return Response.json({ error: 'Not found' }, { status: 404 })
    const { data, error } = await supabase.from('searches').update(searchColumns(parsed.value)).eq('id', id).select('id').maybeSingle()
    if (error || !data) return searchWriteError(error ?? {})
    return Response.json({ id })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('edit search failed', err)
    return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

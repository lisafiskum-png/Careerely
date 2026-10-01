import 'server-only'

// Maps an error from public.mark_application_applied / set_application_status
// (raised with a hint) to the API's usual responses. Anything else is
// unexpected: logged, 500, and nothing was written (one transaction).
export function applicationChangeError(error: { hint?: string | null; message?: string }, conflict: string): Response {
  switch (error.hint) {
    case 'not_found':
      return Response.json({ error: 'Not found' }, { status: 404 })
    case 'read_only':
      return Response.json({ error: 'Your account is read-only.', code: 'read_only' }, { status: 403 })
    case 'invalid':
      return Response.json({ error: 'Invalid request' }, { status: 400 })
    case 'not_submitted':
      return Response.json({ error: 'Confirm that you applied first.' }, { status: 409 })
    case 'not_ready':
      return Response.json({ error: conflict }, { status: 409 })
    default:
      console.error('application change failed', error)
      return Response.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

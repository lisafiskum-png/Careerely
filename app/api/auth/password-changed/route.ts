import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { sendPasswordChangeNotification } from '../../../../lib/password-change-notification'

export async function POST(request: Request) {
  const requestOrigin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if ((requestOrigin && requestOrigin !== new URL(request.url).origin) || fetchSite === 'cross-site') {
    return Response.json({ error: 'Invalid request.' }, { status: 403 })
  }

  try {
    const user = await requireUser()
    if (!user.email) return Response.json({ error: 'Account email unavailable.' }, { status: 400 })
    await sendPasswordChangeNotification(user.email)
    return Response.json({ sent: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('password change notification failed', error)
    return Response.json({ error: 'Notification could not be sent.' }, { status: 500 })
  }
}

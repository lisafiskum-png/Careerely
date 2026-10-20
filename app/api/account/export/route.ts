import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../../lib/auth'
import { buildAccountExport } from '../../../../lib/account-export'
import { createClient } from '../../../../lib/supabase/server'

export async function GET() {
  try {
    const user = await requireUser()
    const payload = await buildAccountExport(await createClient(), user)
    const date = new Date().toISOString().slice(0, 10)

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="careerely-data-${date}.json"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('account export failed', error)
    return Response.json({ error: 'We couldn’t prepare your data export. Please try again or contact hello@careerely.ai.' }, { status: 500 })
  }
}

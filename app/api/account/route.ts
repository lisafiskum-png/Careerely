import { z } from 'zod'
import { requireUser, unauthorizedResponse, UnauthorizedError } from '../../../lib/auth'
import { createClient } from '../../../lib/supabase/server'
import { createAdminClient } from '../../../lib/supabase/admin'
import { getStripe } from '../../../lib/stripe'
import { permanentlyDeleteAccount } from '../../../lib/account-deletion'

const Body = z.object({
  confirmation: z.literal('DELETE'),
  password: z.string().min(1).max(500),
})

/**
 * Permanent account erasure. The user id is always taken from the verified
 * session, and a fresh password check is required immediately before deletion.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !user.email) {
      return Response.json({ error: 'Type DELETE and enter your password to continue.' }, { status: 400 })
    }

    // Sensitive action: require the current password, not just possession of a
    // possibly long-lived browser session.
    const supabase = await createClient()
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.password,
    })
    if (reauthError) {
      return Response.json({ error: 'That password is not correct.' }, { status: 403 })
    }

    await permanentlyDeleteAccount(createAdminClient(), getStripe(), user.id)
    return Response.json({ deleted: true })
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse()
    console.error('account deletion failed', error)
    return Response.json(
      { error: 'We couldn’t delete your account. Nothing else will be changed until you try again.' },
      { status: 500 },
    )
  }
}

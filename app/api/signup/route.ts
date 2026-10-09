import { z } from 'zod'
import { createHmac } from 'node:crypto'
import { createAdminClient } from '../../../lib/supabase/admin'
import { env } from '../../../lib/env'
import { isValidEmail, MIN_PASSWORD_LENGTH, splitFullName } from '../../../lib/onboarding'
import { isPlanId } from '../../../lib/plans'

const Signup = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  selectedPlan: z.string().nullable().optional(),
  agreed: z.literal(true),
})

// Creates the in-progress account without sending Supabase's signup email.
// The customer remains inside onboarding; Careerely sends its own account and
// subscription confirmation only after Stripe confirms payment.
export async function POST(request: Request) {
  const requestOrigin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if ((requestOrigin && requestOrigin !== new URL(request.url).origin) || fetchSite === 'cross-site') {
    return Response.json({ error: 'Invalid signup request.' }, { status: 403 })
  }

  const parsed = Signup.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Please check your details and try again.' }, { status: 400 })

  const { first, last } = splitFullName(parsed.data.name)
  const email = parsed.data.email.toLowerCase()
  if (!first || !isValidEmail(email)) return Response.json({ error: 'Please enter a valid name and email address.' }, { status: 400 })
  if (parsed.data.selectedPlan && !isPlanId(parsed.data.selectedPlan)) {
    return Response.json({ error: 'Please choose a valid plan.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const clientAddress = forwardedFor || request.headers.get('x-real-ip') || 'unknown'
  const rateKey = createHmac('sha256', env.supabaseServiceRoleKey()).update(clientAddress).digest('hex')
  const { data: allowed, error: rateError } = await admin.rpc('claim_signup_attempt', { p_key: rateKey, p_limit: 10 })
  if (rateError) {
    console.error('signup rate limit failed', rateError)
    return Response.json({ error: 'We couldn’t create your account. Please try again.' }, { status: 500 })
  }
  if (!allowed) return Response.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 })

  const { error } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    // Admin creation never sends a confirmation email. The user can continue
    // through onboarding immediately, while the paid confirmation is deferred.
    email_confirm: true,
    user_metadata: {
      first_name: first,
      last_name: last,
      terms_accepted: 'true',
      ...(parsed.data.selectedPlan ? { selected_plan: parsed.data.selectedPlan } : {}),
    },
  })

  if (error) {
    const duplicate = /already|registered|exists/i.test(error.message)
    return Response.json(
      { error: duplicate ? 'An account already exists for this email. Please log in instead.' : 'We couldn’t create your account. Please try again.' },
      { status: duplicate ? 409 : 400 },
    )
  }

  return Response.json({ created: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '../../../lib/supabase/server'
import { safeNextPath } from '../../../lib/onboarding'

const INTERACTIVE_EMAIL_TYPES = new Set<EmailOtpType>(['email', 'recovery'])

function invalidActionUrl(origin: string, type: EmailOtpType | null) {
  const url = new URL('/auth/email-action', origin)
  url.searchParams.set('error', 'link_invalid')
  if (type && INTERACTIVE_EMAIL_TYPES.has(type)) url.searchParams.set('type', type)
  return url
}

// Landing point for links in auth emails (confirm signup, reset password).
// Supports both link styles:
//   ?token_hash=…&type=…  — our email templates (work on any device)
//   ?code=…               — Supabase's default PKCE links (same browser only)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  const supabase = await createClient()
  let ok = false
  let isRecovery = type === 'recovery'

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
    isRecovery = searchParams.get('next') === '/reset-password'
  }

  if (!ok) return NextResponse.redirect(new URL('/login?notice=link_invalid', origin))

  const destination = isRecovery ? '/reset-password' : safeNextPath(searchParams.get('next'), '/dashboard')
  return NextResponse.redirect(new URL(destination, origin))
}

// Email security products commonly prefetch links with GET requests. Recovery
// and confirmation emails therefore land on /auth/email-action first, and only
// this explicit user-submitted POST consumes the single-use Supabase token.
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl
  const formData = await request.formData().catch(() => null)
  const rawTokenHash = formData?.get('token_hash')
  const rawType = formData?.get('type')
  const tokenHash = typeof rawTokenHash === 'string' ? rawTokenHash : ''
  const type = typeof rawType === 'string' ? (rawType as EmailOtpType) : null

  if (!tokenHash || tokenHash.length > 4096 || !type || !INTERACTIVE_EMAIL_TYPES.has(type)) {
    return NextResponse.redirect(invalidActionUrl(origin, type), 303)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) return NextResponse.redirect(invalidActionUrl(origin, type), 303)

  const rawNext = formData?.get('next')
  const destination = type === 'recovery'
    ? '/reset-password'
    : safeNextPath(typeof rawNext === 'string' ? rawNext : null, '/dashboard')

  return NextResponse.redirect(new URL(destination, origin), 303)
}
